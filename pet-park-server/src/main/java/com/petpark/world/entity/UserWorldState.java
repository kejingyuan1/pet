package com.petpark.world.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 玩家世界最后位置（P1 持久化：登录时恢复到上次离开处，避免每次刷新随机到新岛）
 * user_id 为 PK（每用户一行），upsert 覆盖写。
 */
@Data
@TableName("user_world_state")
public class UserWorldState {

    /** 用户ID（关联 users.id）；手动提供，不自动生成 */
    @TableId(type = IdType.INPUT)
    private Long userId;

    /** 世界格 X（连续坐标，double 精度） */
    private Double gx;

    /** 世界格 Z */
    private Double gz;

    /** 高度 Y */
    private Double y;

    /** 出生/所在岛屿索引（islandCenters[] 下标，决定 spawn 钳制到哪座岛） */
    private Integer islandIdx;

    /** 岛屿视觉变体索引（仅视觉选岛，非安全敏感） */
    private Integer variantIdx;

    /** 最后更新时间（DB ON UPDATE CURRENT_TIMESTAMP 自动维护） */
    private LocalDateTime updatedAt;
}
