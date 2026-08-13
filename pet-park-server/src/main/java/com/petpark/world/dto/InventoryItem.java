package com.petpark.world.dto;

import lombok.Data;

/**
 * 背包条目（profile / sell 共用）
 */
@Data
public class InventoryItem {
    /** 物品类型（categories.code） */
    private String type;
    /** 中文名（来自 categories.name） */
    private String name;
    /** 数量 */
    private int qty;
    /** 单价（categories.sell_price，售卖换积分用） */
    private int sellPrice;
}
