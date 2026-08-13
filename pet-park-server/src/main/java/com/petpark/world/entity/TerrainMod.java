package com.petpark.world.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 地形修改表（挖/填/伐木/挖矿等玩家对地形的改动；与设计 03 §4.1 一致）
 *
 * 挖矿（M4）：old_type='ore_*'，new_type='empty'；定时任务删记录 → 矿脉再生。
 * uk_cell(chunk_key,gx,gz) 保证同一格只被认领一次（防并发双采）。
 */
@Data
@TableName("terrain_mods")
public class TerrainMod {

    @TableId(type = IdType.AUTO)
    private Long id;
    /** chunk 标识：cx_cz */
    private String chunkKey;
    /** 世界格 X */
    private Integer gx;
    /** 世界格 Z */
    private Integer gz;
    /** 原语义类型（如 ore_iron） */
    private String oldType;
    /** 新语义类型（如 empty） */
    private String newType;
    /** 操作玩家（关联 users.id） */
    private Long byPlayer;
    private LocalDateTime createdAt;
}
