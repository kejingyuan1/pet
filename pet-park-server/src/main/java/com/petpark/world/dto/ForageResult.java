package com.petpark.world.dto;

import lombok.Data;

import java.util.List;

/**
 * 采集结果（砍树 / 摘野果）：产出数量 + 最新背包快照
 */
@Data
public class ForageResult {
    /** 获得木材数量（砍树必出） */
    private int wood;
    /** 获得野果数量（摘果概率出） */
    private int berry;
    /** 最新背包（含名称/售价，关联 categories） */
    private List<InventoryItem> inventory;
}
