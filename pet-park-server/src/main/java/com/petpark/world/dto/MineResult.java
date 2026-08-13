package com.petpark.world.dto;

import lombok.Data;

/**
 * 采矿结果（经 /user/queue/reply 回 MINE_RESULT.data）
 */
@Data
public class MineResult {
    /** 矿石类型（categories.code：coal_ore/iron_ore/gold_ore） */
    private String oreType;
    /** 本次获得经验 */
    private int expGained;
    /** 采矿后剩余能量 */
    private int energy;
    /** 采矿后等级 */
    private int level;
    /** 该矿石当前背包数量 */
    private int itemQty;
    /** 矿脉世界格 X */
    private int gx;
    /** 矿脉世界格 Z */
    private int gz;
    /** 采空后新语义（empty） */
    private String newType;
}
