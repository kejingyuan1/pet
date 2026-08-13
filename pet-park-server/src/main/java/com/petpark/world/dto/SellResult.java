package com.petpark.world.dto;

import lombok.Data;

import java.util.List;

/**
 * 售卖结果（POST /api/world/mining/sell）
 */
@Data
public class SellResult {
    /** 本次获得积分（金币） */
    private int earnedCoins;
    /** 售卖后金币余额 */
    private int coins;
    /** 剩余背包 */
    private List<InventoryItem> inventory;
}
