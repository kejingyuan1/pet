package com.petpark.world.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.petpark.common.Result;
import com.petpark.entity.Category;
import com.petpark.entity.User;
import com.petpark.mapper.CategoryMapper;
import com.petpark.mapper.UserMapper;
import com.petpark.world.WorldErrors;
import com.petpark.world.dto.WorldObjectResp;
import com.petpark.world.entity.WorldObject;
import com.petpark.world.geo.CellType;
import com.petpark.world.geo.ChunkKey;
import com.petpark.world.mapper.WorldObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.util.ArrayList;
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
    private final ObjectMapper json;

    public WorldObjectService(WorldObjectMapper objectMapper,
                              UserMapper userMapper,
                              CategoryMapper categoryMapper,
                              TerrainService terrain,
                              RegionBroker broker,
                              PhysicsGatewayService physicsGateway,
                              ObjectMapper json) {
        this.objectMapper = objectMapper;
        this.userMapper = userMapper;
        this.categoryMapper = categoryMapper;
        this.terrain = terrain;
        this.broker = broker;
        this.physicsGateway = physicsGateway;
        this.json = json;
    }

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
        // 原子放置 fish_pond（同 cell 不能有其它对象）
        WorldObject obj = newObject(gx, gz, "fish_pond", uid, 0.0);
        obj.setExtJson(toJson(Map.of("fishType", fishType)));
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
