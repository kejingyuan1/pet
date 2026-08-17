package com.petpark.world.dto;

import lombok.Data;

/**
 * 钓鱼结果（经 /user/queue/reply 回 FISH_RESULT.data）
 * 与 MineResult 同构：复用玩家世界能量/经验/等级（养成系统统一）。
 */
@Data
public class FishCatchResult {
    /** 鱼种 code（categories.code，type='fish'，如 minnow/goldfish） */
    private String fishType;
    /** 鱼种中文名（categories.name） */
    private String fishName;
    /** 本次获得经验 */
    private int expGained;
    /** 钓鱼后剩余能量 */
    private int energy;
    /** 钓鱼后等级 */
    private int level;
    /** 该鱼当前背包数量 */
    private int itemQty;
}
