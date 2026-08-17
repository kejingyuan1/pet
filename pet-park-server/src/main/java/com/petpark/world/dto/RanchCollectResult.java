package com.petpark.world.dto;

import lombok.Data;

import java.util.List;

/**
 * 牧场收蛋（动物产物）结果：产物写入背包（world_inventory 持久化）后返回。
 */
@Data
public class RanchCollectResult {
    /** 实际写入背包的物品类型（egg_chicken / egg_duck / milk ...） */
    private String itemType;
    /** 物品名称（鸡蛋 / 鸭蛋 / 牛奶） */
    private String itemName;
    /** 本次获得数量 */
    private int qty;
    /** 最新背包（含名称/售价） */
    private List<InventoryItem> inventory;
}
