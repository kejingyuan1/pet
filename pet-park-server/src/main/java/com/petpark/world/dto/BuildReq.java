package com.petpark.world.dto;

import lombok.Data;

/**
 * 放置建筑请求：{gx, gz, objectType, rot?}
 * objectType 关联 categories.code（type='building'，如 wood_house/stone_house）。
 */
@Data
public class BuildReq {

    private Integer gx;
    private Integer gz;
    private String objectType;
    /** 朝向（弧度），可选 */
    private Double rot;
}
