package com.petpark.world.dto;

import lombok.Data;

/**
 * 售卖请求单项：{type, qty}
 */
@Data
public class ItemSellReq {
    /** 物品类型（categories.code） */
    private String type;
    /** 售卖数量 */
    private Integer qty;
}
