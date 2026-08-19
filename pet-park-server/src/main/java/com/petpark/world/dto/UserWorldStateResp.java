package com.petpark.world.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 玩家世界位置响应（GET /api/world/position）
 */
@Data
public class UserWorldStateResp {
    private Long userId;
    private Double gx;
    private Double gz;
    private Double y;
    private Integer islandIdx;
    private Integer variantIdx;
    private LocalDateTime updatedAt;
}
