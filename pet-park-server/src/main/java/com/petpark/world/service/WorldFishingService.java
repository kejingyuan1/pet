package com.petpark.world.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.common.Result;
import com.petpark.entity.Category;
import com.petpark.entity.User;
import com.petpark.mapper.CategoryMapper;
import com.petpark.mapper.UserMapper;
import com.petpark.world.WorldErrors;
import com.petpark.world.dto.FishCatchResult;
import com.petpark.world.dto.InventoryItem;
import com.petpark.world.geo.CellType;
import com.petpark.world.mapper.WorldInventoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 世界钓鱼服务（P1 养成：采集循环，服务端权威，与 WorldMiningService 同构）
 *
 * 设计要点：
 *  1. 临水校验：玩家物理权威位置（physics-service）周围 FISH_RADIUS 内存在 WATER / RIVER 才允许钓鱼。
 *  2. 能量再生：懒计算（与采矿共用 MAX_ENERGY / REGEN_MS）。
 *  3. 扣能量：再生后条件扣减；不足则抛 insufficientEnergy。
 *  4. 随机鱼种：categories where type='fish' and status=1；DB 无鱼种则回退内置清单（防御性）。
 *  5. 经验/等级/背包：addExperience（level = 1 + floor(exp/100)）+ 背包原子 +1，与采矿共用玩家养成进度。
 */
@Slf4j
@Service
public class WorldFishingService {

    /** 能量上限（与采矿一致） */
    private static final int MAX_ENERGY = 100;
    /** 能量再生间隔（ms）：每 1.5s 回 1 点 */
    private static final long REGEN_MS = 1500L;
    /** 每次钓鱼耗能 */
    private static final int ENERGY_COST = 3;
    /** 临水判定半径（世界单位） */
    private static final double FISH_RADIUS = 3.5;
    /** 临水扫描半宽（FISH_RADIUS 内的格范围） */
    private static final int SCAN_HALF = 4;

    /** DB 无鱼种时的防御性回退清单（code, 中文名） */
    private static final String[][] FALLBACK_FISH = {
        { "minnow", "小鱼" },
        { "goldfish", "金鱼" },
        { "carp", "鲤鱼" },
        { "koi", "锦鲤" },
    };

    private final WorldInventoryMapper inventoryMapper;
    private final UserMapper userMapper;
    private final CategoryMapper categoryMapper;
    private final com.petpark.world.service.TerrainService terrain;
    private final WorldPhysicsService physics;

    public WorldFishingService(WorldInventoryMapper inventoryMapper,
                               UserMapper userMapper,
                               CategoryMapper categoryMapper,
                               com.petpark.world.service.TerrainService terrain,
                               WorldPhysicsService physics) {
        this.inventoryMapper = inventoryMapper;
        this.userMapper = userMapper;
        this.categoryMapper = categoryMapper;
        this.terrain = terrain;
        this.physics = physics;
    }

    /**
     * 钓鱼：服务端原子采集（P1 核心）
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<FishCatchResult> fish(Long uid, int gx, int gz) {
        if (!terrain.inWorld(gx, gz)) {
            throw WorldErrors.outOfBounds();
        }
        // 临水校验：以物理权威位置为准（前端发来的 gx/gz 仅作参考）
        double[] pos = physics.getPlayerPos(uid);
        if (pos == null) {
            throw WorldErrors.notInWorld();
        }
        if (!isNearWater(pos[0], pos[1])) {
            throw WorldErrors.notNearWater();
        }
        // 能量再生（懒计算）
        userMapper.regenEnergy(uid, System.currentTimeMillis(), MAX_ENERGY, REGEN_MS);
        // 扣能量
        if (userMapper.spendEnergy(uid, ENERGY_COST) != 1) {
            throw WorldErrors.insufficientEnergy();
        }
        // 随机鱼种
        String[] fish = pickFish();
        String code = fish[0];
        String name = fish[1];
        // 经验（鱼 categories.exp）+ 等级同步
        Category c = categoryByCode(code);
        int exp = c != null && c.getExp() != null ? c.getExp() : 8;
        userMapper.addExperience(uid, exp);
        // 背包 +1（原子 upsert）
        inventoryMapper.addQty(uid, code, 1);
        // 读取最新状态
        User u = userMapper.selectById(uid);
        int qty = inventoryMapper.qtyOf(uid, code) == null ? 0 : inventoryMapper.qtyOf(uid, code);

        FishCatchResult r = new FishCatchResult();
        r.setFishType(code);
        r.setFishName(name);
        r.setExpGained(exp);
        r.setEnergy(u.getEnergy() == null ? 0 : u.getEnergy());
        r.setLevel(u.getLevel() == null ? 1 : u.getLevel());
        r.setItemQty(qty);
        log.info("[world] uid={} 钓鱼 {} 能量={}", uid, code, r.getEnergy());
        return Result.ok(r);
    }

    /** 玩家权威位置 (px,pz) 周围 SCAN_HALF 内是否存在 WATER / RIVER */
    private boolean isNearWater(double px, double pz) {
        int cx = (int) Math.floor(px);
        int cz = (int) Math.floor(pz);
        for (int dz = -SCAN_HALF; dz <= SCAN_HALF; dz++) {
            for (int dx = -SCAN_HALF; dx <= SCAN_HALF; dx++) {
                if (Math.hypot(dx, dz) > FISH_RADIUS) continue;
                CellType t = terrain.semanticAt(cx + dx, cz + dz);
                if (t == CellType.WATER || t == CellType.RIVER) {
                    return true;
                }
            }
        }
        return false;
    }

    /** 随机选一种鱼（DB 优先，回退内置） */
    private String[] pickFish() {
        List<Category> fishes = categoryMapper.selectList(
                new LambdaQueryWrapper<Category>().eq(Category::getType, "fish").eq(Category::getStatus, 1));
        if (fishes != null && !fishes.isEmpty()) {
            Category c = fishes.get((int) (Math.random() * fishes.size()));
            return new String[] { c.getCode(), c.getName() != null ? c.getName() : c.getCode() };
        }
        return FALLBACK_FISH[(int) (Math.random() * FALLBACK_FISH.length)];
    }

    private Category categoryByCode(String code) {
        return categoryMapper.selectOne(new LambdaQueryWrapper<Category>()
                .eq(Category::getCode, code)
                .last("LIMIT 1"));
    }
}
