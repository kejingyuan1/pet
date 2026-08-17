package com.petpark.world.service;

import com.petpark.entity.User;
import com.petpark.mapper.UserMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 养成循环服务（P1 养成支柱③）——收益曲线 + 等级进度 + 解锁里程碑。
 *
 * 汇总玩家养成进度（等级/经验/能量/积分），并暴露可调参数化的收益曲线与解锁阶梯，
 * 供前端「养成」面板展示进度与「下一个解锁」目标。
 *
 * 收益模型（与 WorldMiningService / WorldFishingService 同源常量）：
 *  - 升级：level = 1 + floor(exp / 100)，每级需 100 exp；
 *  - 能量：上限 100，每 1.5s 回 1 点（regenerate 1/1.5s）；
 *  - 单次动作耗能：钓鱼 3、采矿 4（见各 service 常量）；
 *  - 单动作经验：鱼/矿 categories.exp（基准 8/10）。
 *
 * 解锁阶梯（里程碑，等级到达即 unlocked=true；实际玩法门控可后续接入）：
 *  Lv.1 初入乐园 · 基础采集；Lv.2 铁矿开采；Lv.3 稀有鱼种；
 *  Lv.5 金矿开采；Lv.8 高级建筑蓝图；Lv.12 传说渔场。
 */
@Slf4j
@Service
public class WorldCultivationService {

    private static final int MAX_ENERGY = 100;
    private static final long REGEN_MS = 1500L;
    private static final int FISH_ENERGY_COST = 3;
    private static final int MINE_ENERGY_COST = 4;
    private static final int EXP_PER_LEVEL = 100;
    private static final int FISH_EXP_BASE = 8;
    private static final int MINE_EXP_BASE = 10;

    /** 解锁里程碑：[等级, 名称] */
    private static final Object[][] UNLOCKS = {
        { 1, "初入乐园 · 基础采集" },
        { 2, "铁矿开采" },
        { 3, "稀有鱼种图鉴" },
        { 5, "金矿开采" },
        { 8, "高级建筑蓝图" },
        { 12, "传说渔场" }
    };

    private final UserMapper userMapper;

    public WorldCultivationService(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    /** 养成汇总 */
    public Map<String, Object> summary(Long uid) {
        // 能量懒再生（与采矿/钓鱼一致，幂等）
        userMapper.regenEnergy(uid, System.currentTimeMillis(), MAX_ENERGY, REGEN_MS);
        User u = userMapper.selectById(uid);
        long exp = u.getExperience() == null ? 0 : u.getExperience();
        int level = u.getLevel() == null ? 1 : u.getLevel();

        List<Map<String, Object>> unlocks = new ArrayList<>();
        for (Object[] uk : UNLOCKS) {
            int lv = (Integer) uk[0];
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("level", lv);
            m.put("name", uk[1]);
            m.put("unlocked", level >= lv);
            unlocks.add(m);
        }

        Map<String, Object> yield = new LinkedHashMap<>();
        yield.put("expPerLevel", EXP_PER_LEVEL);
        yield.put("fishExpBase", FISH_EXP_BASE);
        yield.put("mineExpBase", MINE_EXP_BASE);
        yield.put("fishEnergyCost", FISH_ENERGY_COST);
        yield.put("mineEnergyCost", MINE_ENERGY_COST);
        yield.put("energyRegenPerSec", 1000.0 / REGEN_MS);
        yield.put("maxEnergy", MAX_ENERGY);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("level", level);
        out.put("exp", exp);
        out.put("expToNext", (int) (EXP_PER_LEVEL - exp % EXP_PER_LEVEL));
        out.put("energy", u.getEnergy() == null ? 0 : u.getEnergy());
        out.put("maxEnergy", MAX_ENERGY);
        out.put("coins", u.getCoins() == null ? 0 : u.getCoins());
        out.put("yield", yield);
        out.put("unlocks", unlocks);
        return out;
    }
}
