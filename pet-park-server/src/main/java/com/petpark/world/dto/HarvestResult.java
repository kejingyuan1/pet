package com.petpark.world.dto;

import lombok.Data;

/**
 * 鱼塘收获结果（P1 养殖循环）
 *  - ready=false：尚未成熟，remainingMs 为还需等待毫秒；
 *  - ready=true：已收获，reward 为本次发放的金币奖励。
 */
@Data
public class HarvestResult {
    /** 是否成熟可收获 */
    private boolean ready;
    /** 成熟时发放的金币奖励 */
    private int reward;
    /** 未成熟时还需等待的毫秒 */
    private long remainingMs;
    /** 操作后玩家金币余额 */
    private int coins;
}
