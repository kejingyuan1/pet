package com.petpark.world.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.common.Result;
import com.petpark.entity.Category;
import com.petpark.entity.User;
import com.petpark.mapper.CategoryMapper;
import com.petpark.mapper.UserMapper;
import com.petpark.world.WorldErrors;
import com.petpark.world.dto.InventoryItem;
import com.petpark.world.dto.ItemSellReq;
import com.petpark.world.dto.MineResult;
import com.petpark.world.dto.MiningProfile;
import com.petpark.world.dto.SellResult;
import com.petpark.world.entity.TerrainMod;
import com.petpark.world.geo.CellType;
import com.petpark.world.geo.ChunkKey;
import com.petpark.world.mapper.TerrainModMapper;
import com.petpark.world.mapper.WorldInventoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 世界采矿服务（M4 资源采集，服务端权威，ADR-W4 原子化）
 *
 * 设计要点（与 WorldObjectService 同源）：
 *  1. 采矿校验：cell 为矿脉（base 语义 isOre）+ 未被采空（terrain_mods 无记录）+ 玩家邻近（物理位置 ≤ MINE_RADIUS）。
 *  2. 能量再生：懒计算——每次 mine/profile 按 (now - energy_updated_at) 补能量，避免后台定时器。
 *  3. 认领矿格：INSERT IGNORE + uk_cell 防并发双采；认领失败（被抢先/已采）→ oreDepleted。
 *  4. 扣能量：再生后条件扣减；不足则退还认领（deleteOwned）并抛 insufficientEnergy。
 *  5. 经验/等级/背包：addExperience（level = 1 + floor(exp/100) 单语句同步）+ 背包原子 +1。
 *  6. 广播 TERRAIN_CHANGE 在事务 afterCommit 发送，保证接收方读到已提交的矿格改动。
 */
@Slf4j
@Service
public class WorldMiningService {

    /** 能量上限 */
    private static final int MAX_ENERGY = 100;
    /** 能量再生间隔（ms）：每 1.5s 回 1 点 */
    private static final long REGEN_MS = 1500L;
    /** 每次采矿耗能 */
    private static final int ENERGY_COST = 4;
    /** 采矿邻近半径（世界单位，1 格 = 1 单位） */
    private static final double MINE_RADIUS = 3.5;

    private final TerrainModMapper terrainModMapper;
    private final WorldInventoryMapper inventoryMapper;
    private final UserMapper userMapper;
    private final CategoryMapper categoryMapper;
    private final TerrainService terrain;
    private final WorldPhysicsService physics;
    private final RegionBroker broker;

    public WorldMiningService(TerrainModMapper terrainModMapper,
                              WorldInventoryMapper inventoryMapper,
                              UserMapper userMapper,
                              CategoryMapper categoryMapper,
                              TerrainService terrain,
                              WorldPhysicsService physics,
                              RegionBroker broker) {
        this.terrainModMapper = terrainModMapper;
        this.inventoryMapper = inventoryMapper;
        this.userMapper = userMapper;
        this.categoryMapper = categoryMapper;
        this.terrain = terrain;
        this.physics = physics;
        this.broker = broker;
    }

    /**
     * 采矿：服务端原子采掘（M4 核心）
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<MineResult> mine(Long uid, int gx, int gz) {
        if (!terrain.inWorld(gx, gz)) {
            throw WorldErrors.outOfBounds();
        }
        // 矿脉校验（base 语义，未叠加 terrain_mods）
        CellType t = terrain.semanticAt(gx, gz);
        if (!t.isOre()) {
            throw WorldErrors.notOre();
        }
        String ck = ChunkKey.ofWorld(gx, gz);
        // 已被采空（自己或他人）
        if (terrainModMapper.existsCell(ck, gx, gz) != null) {
            throw WorldErrors.oreDepleted();
        }
        // 邻近校验：玩家当前物理位置（权威）
        double[] pos = physics.getPlayerPos(uid);
        if (pos == null) {
            throw WorldErrors.notInWorld();
        }
        double dist = Math.hypot(pos[0] - gx, pos[1] - gz);
        if (dist > MINE_RADIUS) {
            throw WorldErrors.tooFar();
        }
        // 能量再生（懒计算）
        userMapper.regenEnergy(uid, System.currentTimeMillis(), MAX_ENERGY, REGEN_MS);
        // 认领矿格（防并发双采）
        TerrainMod mod = new TerrainMod();
        mod.setChunkKey(ck);
        mod.setGx(gx);
        mod.setGz(gz);
        mod.setOldType(t.typeName());
        mod.setNewType("empty");
        mod.setByPlayer(uid);
        if (terrainModMapper.insertIfAbsent(mod) != 1) {
            throw WorldErrors.oreDepleted();
        }
        // 扣能量（再生后）；不足则退还认领
        if (userMapper.spendEnergy(uid, ENERGY_COST) != 1) {
            terrainModMapper.deleteOwned(ck, gx, gz, uid);
            throw WorldErrors.insufficientEnergy();
        }
        // 经验（矿石 categories.exp）+ 等级同步
        int exp = oreExp(t);
        userMapper.addExperience(uid, exp);
        // 背包 +1（原子 upsert）
        inventoryMapper.addQty(uid, t.typeName(), 1);
        // 读取最新状态
        User u = userMapper.selectById(uid);
        int qty = inventoryMapper.qtyOf(uid, t.typeName()) == null ? 0 : inventoryMapper.qtyOf(uid, t.typeName());
        // 广播地形变化（afterCommit）
        broadcastTerrainChangeAfterCommit(ck, gx, gz, "empty", t.typeName());

        MineResult r = new MineResult();
        r.setOreType(t.typeName());
        r.setExpGained(exp);
        r.setEnergy(u.getEnergy() == null ? 0 : u.getEnergy());
        r.setLevel(u.getLevel() == null ? 1 : u.getLevel());
        r.setItemQty(qty);
        r.setGx(gx);
        r.setGz(gz);
        r.setNewType("empty");
        log.info("[world] uid={} 采矿 {} @({},{}) exp+{} 能量={}", uid, t.typeName(), gx, gz, exp, r.getEnergy());
        return Result.ok(r);
    }

    /**
     * 采矿档案（能量/等级/经验/背包）
     */
    public Result<MiningProfile> profile(Long uid) {
        userMapper.regenEnergy(uid, System.currentTimeMillis(), MAX_ENERGY, REGEN_MS);
        User u = userMapper.selectById(uid);
        MiningProfile p = new MiningProfile();
        long exp = u.getExperience() == null ? 0 : u.getExperience();
        p.setEnergy(u.getEnergy() == null ? 0 : u.getEnergy());
        p.setMaxEnergy(MAX_ENERGY);
        p.setLevel(1 + (int) (exp / 100));
        p.setExp(exp);
        p.setExpToNext((int) (100 - exp % 100));
        p.setInventory(listInventory(uid));
        return Result.ok(p);
    }

    /**
     * 售卖矿石换积分（金币）；按品类 sell_price 结算，库存不足则该项跳过并提示。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<SellResult> sell(Long uid, List<ItemSellReq> items) {
        int earned = 0;
        if (items != null) {
            for (ItemSellReq it : items) {
                if (it == null || it.getQty() == null || it.getQty() <= 0 || it.getType() == null) {
                    continue;
                }
                Category c = categoryByCode(it.getType());
                if (c == null) {
                    continue;
                }
                int sellPrice = c.getSellPrice() == null ? 0 : c.getSellPrice();
                if (sellPrice <= 0) {
                    continue;
                }
                int qtyOut = it.getQty();
                // 条件扣减（库存不足返回 0 → 跳过该项，不因他人/自己状态中断整单）
                if (inventoryMapper.consume(uid, it.getType(), qtyOut) != 1) {
                    log.warn("[world] 售卖跳过：库存不足 uid={} type={} want={}", uid, it.getType(), qtyOut);
                    continue;
                }
                earned += sellPrice * qtyOut;
            }
        }
        if (earned > 0) {
            userMapper.addCoins(uid, earned);
        }
        User u = userMapper.selectById(uid);
        SellResult r = new SellResult();
        r.setEarnedCoins(earned);
        r.setCoins(u.getCoins() == null ? 0 : u.getCoins());
        r.setInventory(listInventory(uid));
        log.info("[world] uid={} 售卖矿石获得 {} 积分，余额 {}", uid, earned, r.getCoins());
        return Result.ok(r);
    }

    // ================= 内部工具 =================

    /** 背包列表（关联 categories 名称/售价） */
    private List<InventoryItem> listInventory(Long uid) {
        List<Map<String, Object>> rows = inventoryMapper.listByUid(uid);
        List<InventoryItem> inv = new ArrayList<>();
        if (rows == null) {
            return inv;
        }
        for (Map<String, Object> r : rows) {
            String type = String.valueOf(r.get("item_type"));
            int qty = toInt(r.get("qty"));
            if (qty <= 0) {
                continue;
            }
            Category c = categoryByCode(type);
            InventoryItem it = new InventoryItem();
            it.setType(type);
            it.setName(c != null && c.getName() != null ? c.getName() : type);
            it.setQty(qty);
            it.setSellPrice(c != null && c.getSellPrice() != null ? c.getSellPrice() : 0);
            inv.add(it);
        }
        return inv;
    }

    /** 矿石经验（categories.exp，缺省 10） */
    private int oreExp(CellType t) {
        Category c = categoryByCode(t.typeName());
        return c != null && c.getExp() != null ? c.getExp() : 10;
    }

    private Category categoryByCode(String code) {
        return categoryMapper.selectOne(new LambdaQueryWrapper<Category>()
                .eq(Category::getCode, code)
                .last("LIMIT 1"));
    }

    private static int toInt(Object v) {
        if (v == null) {
            return 0;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * 广播地形变化（TERRAIN_CHANGE）：事务提交后发送，接收方永远读到已提交矿格改动。
     */
    private void broadcastTerrainChangeAfterCommit(String ck, int gx, int gz, String newType, String oreType) {
        Runnable publish = () -> broker.broadcastWorld(Map.of(
                "t", "TERRAIN_CHANGE",
                "chunkKey", ck,
                "gx", gx,
                "gz", gz,
                "newType", newType,
                "oreType", oreType));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publish.run();
                }
            });
        } else {
            log.warn("[world] 非事务调用（TERRAIN_CHANGE 无 afterCommit 保护）chunkKey={}", ck);
            publish.run();
        }
    }
}
