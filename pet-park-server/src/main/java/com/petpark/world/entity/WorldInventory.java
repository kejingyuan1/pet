package com.petpark.world.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 世界背包表（玩家世界采集物，M4 采矿使用；与设计 03 §4.1 一致）
 *
 * uk_owner_item(uid,item_type) 保证每个玩家每种物品一行；
 * 采集时通过 INSERT ... ON DUPLICATE KEY UPDATE qty = qty + 1 原子累加。
 */
@Data
@TableName("world_inventory")
public class WorldInventory {

    @TableId(type = IdType.AUTO)
    private Long id;
    /** 玩家（关联 users.id） */
    private Long uid;
    /** 物品类型（=categories.code，如 coal_ore/iron_ore/gold_ore） */
    private String itemType;
    /** 数量 */
    private Integer qty;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
