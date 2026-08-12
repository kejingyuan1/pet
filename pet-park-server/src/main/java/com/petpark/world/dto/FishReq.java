package com.petpark.world.dto;

import lombok.Data;

/**
 * 养鱼请求：{gx, gz, fishType}
 * 校验目标 cell 为 water；落地 world_objects(type='fish_pond', ext_json={fishType})。
 */
@Data
public class FishReq {

    private Integer gx;
    private Integer gz;
    /** 鱼种（categories.code，type='fish'，如 minnow/goldfish） */
    private String fishType;
}
