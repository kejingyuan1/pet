package com.petpark.world.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 世界物理快照表（ADR-W7 候选②：physics-service 崩溃续跑）
 * physics-service world.takeSnapshot() 二进制 → 本表 BLOB；低频覆盖写（5s / 事件）。
 */
@Data
@TableName("world_physics_snapshot")
public class PhysicsSnapshot {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 世界分片标识（当前单服恒为 global；预留分片扩容） */
    private String chunkKey;

    /** 物理 tick 号（固定步进计数，恢复时对齐） */
    private Long tick;

    /** Rapier takeSnapshot() 二进制（Uint8Array） */
    private byte[] snapshot;

    /** 快照内刚体数（诊断/校验） */
    private Integer bodyCount;

    private LocalDateTime createdAt;
}
