package com.petpark.world.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.petpark.common.Result;
import com.petpark.entity.Category;
import com.petpark.entity.User;
import com.petpark.mapper.CategoryMapper;
import com.petpark.mapper.UserMapper;
import com.petpark.world.WorldErrors;
import com.petpark.world.dto.HarvestResult;
import com.petpark.world.dto.WorldObjectResp;
import com.petpark.world.entity.WorldObject;
import com.petpark.world.geo.CellType;
import com.petpark.world.geo.ChunkKey;
import com.petpark.world.mapper.WorldObjectMapper;
import com.petpark.world.mapper.WorldInventoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 世界对象服务（放置 / 养鱼，服务端权威，ADR-W4 原子化）
 *
 * 并发修正要点：
 *  1. 条件 INSERT（WHERE NOT EXISTS state=1）防同 cell 双置，判 affectedRows==1；
 *     不再"先 exists 再 insert"（并发下双插）。
 *  2. 条件 UPDATE（WHERE coins>=cost）防负币，失败抛 BizException 触发 @Transactional 回滚 insert。
 *  3. DuplicateKeyException 兜底由 GlobalExceptionHandler 映射为 WORLD_CELL_OCCUPIED。
 *  4. 扣款 + 落库同一事务；广播在事务提交后（afterCommit）发送，避免接收方读到未提交对象。
 *
 * 事务边界复核（O1，回归：WS build 扣款偶发未生效）：
 *  - placeBuild / stockFish 均为 public @Transactional，REST 与 WS（@MessageMapping 线程）都经
 *    Spring 代理调用，事务本应生效；若日志出现 "[world] 非事务调用" 告警，说明调用链绕过了事务
 *    （此时"insert 提交 + 扣款失败"的未付费对象状态才会出现），须沿告警排查调用方。
 *  - 广播从事务内移出到 afterCommit：即使事务未生效，广播时机也与提交解耦，行为可观测。
 */
@Slf4j
@Service
public class WorldObjectService {

    private final WorldObjectMapper objectMapper;
    private final UserMapper userMapper;
    private final CategoryMapper categoryMapper;
    private final TerrainService terrain;
    private final RegionBroker broker;
    private final PhysicsGatewayService physicsGateway;
    private final WorldInventoryMapper inventoryMapper;
    private final ObjectMapper json;

    public WorldObjectService(WorldObjectMapper objectMapper,
                              UserMapper userMapper,
                              CategoryMapper categoryMapper,
                              TerrainService terrain,
                              RegionBroker broker,
                              PhysicsGatewayService physicsGateway,
                              WorldInventoryMapper inventoryMapper,
                              ObjectMapper json) {
        this.objectMapper = objectMapper;
        this.userMapper = userMapper;
        this.categoryMapper = categoryMapper;
        this.terrain = terrain;
        this.broker = broker;
        this.physicsGateway = physicsGateway;
        this.inventoryMapper = inventoryMapper;
        this.json = json;
    }

    // ================= 玩法常量（P0/P1/P2 审计缺口） =================
    /** 建筑最高等级（升级上限） */
    private static final int MAX_UPGRADE_LEVEL = 3;
    /** 鱼塘成熟周期（ms）：演示用 60s 一轮，成熟即可收获并重置（可再生鱼塘） */
    private static final long DEFAULT_FISH_CYCLE_MS = 60000L;

    /** 放置建筑（REST / WS 共用） */
    @Transactional(rollbackFor = Exception.class)
    public Result<WorldObjectResp> placeBuild(Long uid, int gx, int gz, String objectType, Double rot) {
        if (!terrain.inWorld(gx, gz)) {
            throw WorldErrors.outOfBounds();
        }
        // 语义：只能放 buildable cell（grass/sand + 坡度OK + 非树/岩/矿）
        if (!terrain.isBuildable(gx, gz)) {
            throw WorldErrors.notBuildable();
        }
        Category cat = categoryByCode(objectType);
        if (cat == null || !"building".equals(cat.getType())) {
            throw WorldErrors.badObjectType();
        }
        // 等级门槛（P0 审计缺口 #3）：玩家等级需 ≥ 建筑 level_req
        checkLevelReq(uid, cat);
        // 原子放置（条件 INSERT，防双置）
        WorldObject obj = newObject(gx, gz, objectType, uid, rot == null ? 0.0 : rot);
        int placed = objectMapper.insertIfAbsent(obj);
        if (placed != 1) {
            throw WorldErrors.cellOccupied();
        }
        // 条件扣款（防负币）；失败回滚上面的 insert
        if (userMapper.updateCoinsIfEnough(uid, cat.getPrice()) != 1) {
            throw WorldErrors.insufficientCoins();
        }
        WorldObjectResp resp = toResp(obj);
        broadcastAfterCommit(obj.getChunkKey(), Map.of(
                "t", "OBJECT_ADD",
                "chunkKey", obj.getChunkKey(),
                "object", resp));
        log.info("[world] uid={} 放置建筑 {} @({},{}) id={}", uid, objectType, gx, gz, obj.getId());
        return Result.ok(resp);
    }

    /** 湖中养鱼（校验 water cell，落地 fish_pond，复用原子放置路径） */
    @Transactional(rollbackFor = Exception.class)
    public Result<WorldObjectResp> stockFish(Long uid, int gx, int gz, String fishType) {
        if (!terrain.inWorld(gx, gz)) {
            throw WorldErrors.outOfBounds();
        }
        // 只能湖里养鱼
        if (terrain.semanticAt(gx, gz) != CellType.WATER) {
            throw WorldErrors.notWater();
        }
        Category fish = categoryByCode(fishType);
        if (fish == null || !"fish".equals(fish.getType())) {
            throw WorldErrors.badObjectType();
        }
        // 等级门槛（P0 审计缺口 #3）：玩家等级需 ≥ 鱼种 level_req
        checkLevelReq(uid, fish);
        // 原子放置 fish_pond（同 cell 不能有其它对象）；ext_json 记录养殖周期（P1 养殖循环）
        WorldObject obj = newObject(gx, gz, "fish_pond", uid, 0.0);
        obj.setExtJson(toJson(Map.of(
                "fishType", fishType,
                "plantedAt", System.currentTimeMillis(),
                "cycleMs", DEFAULT_FISH_CYCLE_MS)));
        int placed = objectMapper.insertIfAbsent(obj);
        if (placed != 1) {
            throw WorldErrors.cellOccupied();
        }
        if (userMapper.updateCoinsIfEnough(uid, fish.getPrice()) != 1) {
            throw WorldErrors.insufficientCoins();
        }
        WorldObjectResp resp = toResp(obj);
        broadcastAfterCommit(obj.getChunkKey(), Map.of(
                "t", "OBJECT_ADD",
                "chunkKey", obj.getChunkKey(),
                "object", resp));
        log.info("[world] uid={} 养鱼 {} @({},{}) id={}", uid, fishType, gx, gz, obj.getId());
        return Result.ok(resp);
    }

    // ================= 拆除 / 升级 / 收获（P0 / P2 / P1 审计缺口） =================

    /**
     * 拆除建筑（P0 审计缺口 #3）：软删（state=0 保留记录）自己放置的对象 + 广播 OBJECT_REMOVE。
     * 规则：不退还金币（视为放弃资源，避免刷金币）；只能拆自己的。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<WorldObjectResp> removeObject(Long uid, int gx, int gz) {
        if (!terrain.inWorld(gx, gz)) {
            throw WorldErrors.outOfBounds();
        }
        String ck = ChunkKey.ofWorld(gx, gz);
        WorldObject obj = objectMapper.selectAt(ck, gx, gz);
        if (obj == null) {
            throw WorldErrors.objectNotFound();
        }
        if (!obj.getOwnerId().equals(uid)) {
            throw WorldErrors.notOwner();
        }
        if (objectMapper.softDelete(obj.getId()) != 1) {
            throw WorldErrors.objectNotFound();
        }
        broadcastAfterCommit(ck, Map.of(
                "t", "OBJECT_REMOVE",
                "id", obj.getId(),
                "gx", gx, "gz", gz,
                "chunkKey", ck));
        log.info("[world] uid={} 拆除对象 {} @({},{}) id={}", uid, obj.getType(), gx, gz, obj.getId());
        return Result.ok(toResp(obj));
    }

    /**
     * 建筑升级（P2 审计缺口 #4）：等级 +1，扣升级费（基础价 × 当前等级），写 ext_json，广播 OBJECT_UPDATE。
     * 只能升级自己放置的建筑；达上限抛 maxLevel。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<WorldObjectResp> upgradeObject(Long uid, int gx, int gz) {
        if (!terrain.inWorld(gx, gz)) {
            throw WorldErrors.outOfBounds();
        }
        String ck = ChunkKey.ofWorld(gx, gz);
        WorldObject obj = objectMapper.selectAt(ck, gx, gz);
        if (obj == null) {
            throw WorldErrors.objectNotFound();
        }
        if (!obj.getOwnerId().equals(uid)) {
            throw WorldErrors.notOwner();
        }
        Map<String, Object> ext = parseExtToMap(obj.getExtJson());
        int level = ext.get("level") instanceof Number n ? n.intValue() : 1;
        if (level >= MAX_UPGRADE_LEVEL) {
            throw WorldErrors.maxLevel();
        }
        Category cat = categoryByCode(obj.getType());
        int base = cat != null && cat.getPrice() != null ? cat.getPrice() : 0;
        int cost = base * level; // 升级费随等级递增
        if (userMapper.updateCoinsIfEnough(uid, cost) != 1) {
            throw WorldErrors.insufficientCoins();
        }
        int newLevel = level + 1;
        ext.put("level", newLevel);
        objectMapper.updateExtJson(obj.getId(), toJson(ext));
        WorldObjectResp resp = toResp(obj);
        resp.setExtJson(ext);
        broadcastAfterCommit(ck, Map.of(
                "t", "OBJECT_UPDATE",
                "id", obj.getId(),
                "gx", gx, "gz", gz,
                "level", newLevel,
                "extJson", ext,
                "chunkKey", ck));
        log.info("[world] uid={} 升级 {} → Lv{} @({},{}) id={}", uid, obj.getType(), newLevel, gx, gz, obj.getId());
        return Result.ok(resp);
    }

    /**
     * 鱼塘收获（P1 养殖循环）：成熟则发放金币奖励（鱼种 sell_price）并重置周期（可再生鱼塘）；
     * 未成熟返回剩余时间（ready=false）。只能收获自己的鱼塘。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<HarvestResult> harvestFish(Long uid, int gx, int gz) {
        if (!terrain.inWorld(gx, gz)) {
            throw WorldErrors.outOfBounds();
        }
        String ck = ChunkKey.ofWorld(gx, gz);
        WorldObject obj = objectMapper.selectAt(ck, gx, gz);
        if (obj == null) {
            throw WorldErrors.objectNotFound();
        }
        if (!obj.getOwnerId().equals(uid)) {
            throw WorldErrors.notOwner();
        }
        if (!"fish_pond".equals(obj.getType())) {
            throw WorldErrors.badObjectType();
        }
        Map<String, Object> ext = parseExtToMap(obj.getExtJson());
        long plantedAt = ext.get("plantedAt") instanceof Number n ? n.longValue() : 0L;
        long cycleMs = ext.get("cycleMs") instanceof Number n ? n.longValue() : DEFAULT_FISH_CYCLE_MS;
        long elapsed = System.currentTimeMillis() - plantedAt;
        HarvestResult r = new HarvestResult();
        if (elapsed < cycleMs) {
            r.setReady(false);
            r.setRemainingMs(cycleMs - elapsed);
            r.setCoins(userCoins(uid));
            return Result.ok(r);
        }
        String fishType = ext.get("fishType") instanceof String s ? s : "goldfish";
        Category fish = categoryByCode(fishType);
        int reward = fish != null && fish.getSellPrice() != null ? fish.getSellPrice() : 0;
        if (reward > 0) {
            userMapper.addCoins(uid, reward);
        }
        // 收获的鱼进背包（与金币奖励并存，world_inventory 持久化）
        inventoryMapper.addQty(uid, fishType, 1);
        ext.put("plantedAt", System.currentTimeMillis());
        objectMapper.updateExtJson(obj.getId(), toJson(ext));
        r.setReady(true);
        r.setReward(reward);
        r.setCoins(userCoins(uid));
        broadcastAfterCommit(ck, Map.of(
                "t", "OBJECT_UPDATE",
                "id", obj.getId(),
                "gx", gx, "gz", gz,
                "extJson", ext,
                "chunkKey", ck));
        log.info("[world] uid={} 收获鱼塘 {} @({},{}) 奖励{}", uid, fishType, gx, gz, reward);
        return Result.ok(r);
    }

    /** 拉取某 chunk 内全部正常对象（chunk 响应 / 快照用） */
    public List<WorldObjectResp> listByChunk(int cx, int cz) {
        return listByChunkKey(ChunkKey.of(cx, cz));
    }

    public List<WorldObjectResp> listByChunkKey(String chunkKey) {
        List<Map<String, Object>> rows = objectMapper.listByChunk(chunkKey);
        List<WorldObjectResp> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            out.add(fromRow(r));
        }
        return out;
    }

    // ================= 内部工具 =================

    /**
     * 广播世界事件（OBJECT_ADD 等）：事务提交后发送。
     *  - 事务生效：注册 afterCommit 回调，接收方永远读到已提交对象；
     *  - 事务未生效（O1 复核的异常路径）：直接广播并告警，让"绕过事务"可见可查。
     *  - 同时通知 physics-service 增加静态碰撞体（ADR-W7：放置成功 → add_collider）。
     */
    private void broadcastAfterCommit(String chunkKey, Object payload) {
        Runnable publish = () -> {
            broker.broadcast(chunkKey, payload);
            // 提取对象信息通知物理服务（collider 只应在事务提交后出现）
            if (payload instanceof Map<?, ?> m && m.get("object") instanceof WorldObjectResp o) {
                physicsGateway.notifyObjectPlaced(o.getId(), o.getGx(), o.getGz(), o.getType(),
                        terrain.heightAt(o.getGx(), o.getGz()));
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publish.run();
                }
            });
        } else {
            log.warn("[world] 非事务调用（broadcast 无 afterCommit 保护），原子性依赖事务，请检查调用链 chunkKey={}", chunkKey);
            publish.run();
        }
    }

    private Category categoryByCode(String code) {
        return categoryMapper.selectOne(new LambdaQueryWrapper<Category>()
                .eq(Category::getCode, code)
                .eq(Category::getStatus, 1)
                .last("LIMIT 1"));
    }

    private WorldObject newObject(int gx, int gz, String type, Long uid, double rot) {
        WorldObject o = new WorldObject();
        o.setChunkKey(ChunkKey.ofWorld(gx, gz));
        o.setGx(gx);
        o.setGz(gz);
        o.setType(type);
        o.setOwnerId(uid);
        o.setRot(BigDecimal.valueOf(rot));
        o.setState(1);
        return o;
    }

    /** 等级门槛校验：玩家等级需 ≥ 品类 level_req（P0 审计缺口 #3） */
    private void checkLevelReq(Long uid, Category cat) {
        Integer req = cat.getLevelReq();
        if (req == null || req <= 1) {
            return; // 无门槛或门槛为 1（默认满足）
        }
        User me = userMapper.selectById(uid);
        int myLevel = me != null && me.getLevel() != null ? me.getLevel() : 1;
        if (myLevel < req) {
            throw WorldErrors.levelNotEnough();
        }
    }

    /** ext_json 文本 → Map（解析失败返回空 Map，便于升级/养殖状态读写） */
    private Map<String, Object> parseExtToMap(String ext) {
        Object o = parseExt(ext);
        if (o instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) o;
            return m;
        }
        return new LinkedHashMap<>();
    }

    /** 查玩家当前金币（收获后刷新展示用） */
    private int userCoins(Long uid) {
        User u = userMapper.selectById(uid);
        return u != null && u.getCoins() != null ? u.getCoins() : 0;
    }

    private String toJson(Object v) {
        try {
            return json.writeValueAsString(v);
        } catch (Exception e) {
            return "{}";
        }
    }

    /** 实体 → 响应 DTO（补 owner 昵称） */
    private WorldObjectResp toResp(WorldObject o) {
        String nick = "";
        if (o.getOwnerId() != null) {
            User u = userMapper.selectById(o.getOwnerId());
            if (u != null) {
                nick = u.getNickname() == null ? "" : u.getNickname();
            }
        }
        return WorldObjectResp.from(o.getId(), o.getType(), o.getGx(), o.getGz(),
                o.getRot(), o.getOwnerId(), nick, parseExt(o.getExtJson()), o.getState());
    }

    /** listByChunk 行（Map）→ DTO */
    private WorldObjectResp fromRow(Map<String, Object> r) {
        Object ownerUid = r.get("owner_id");
        Object ownerNick = r.get("owner_nick");
        Object rot = r.get("rot");
        Object ext = parseExt(r.get("ext_json"));
        return WorldObjectResp.from(
                toLong(r.get("id")),
                String.valueOf(r.get("type")),
                toInt(r.get("gx")),
                toInt(r.get("gz")),
                rot instanceof BigDecimal bd ? bd : BigDecimal.ZERO,
                ownerUid == null ? 0L : toLong(ownerUid),
                ownerNick == null ? "" : String.valueOf(ownerNick),
                ext,
                1);
    }

    private Object parseExt(Object ext) {
        if (ext == null) {
            return null;
        }
        if (ext instanceof String s && !s.isEmpty()) {
            try {
                return json.readValue(s, Object.class);
            } catch (Exception e) {
                return ext;
            }
        }
        return ext;
    }

    private static long toLong(Object v) {
        return v instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(v));
    }

    private static int toInt(Object v) {
        return v instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(v));
    }
}
