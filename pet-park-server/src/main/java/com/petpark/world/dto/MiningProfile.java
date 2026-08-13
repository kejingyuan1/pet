package com.petpark.world.dto;

import lombok.Data;

import java.util.List;

/**
 * 采矿档案（GET /api/world/mining/profile）
 */
@Data
public class MiningProfile {
    /** 当前能量 */
    private int energy;
    /** 能量上限 */
    private int maxEnergy;
    /** 当前世界等级（由累积经验推导：1 + floor(exp/100)） */
    private int level;
    /** 累积经验 */
    private long exp;
    /** 距下一级所需经验 */
    private int expToNext;
    /** 背包 */
    private List<InventoryItem> inventory;
}
