package com.petpark.world.dto;

import lombok.Data;

/**
 * WS 放置请求：/app/ws.build {gx, gz, objectType}（与 REST 同一 service，服务端权威校验）
 */
@Data
public class WsBuildMsg {

    private Integer gx;
    private Integer gz;
    private String objectType;
    private Double rot;
}
