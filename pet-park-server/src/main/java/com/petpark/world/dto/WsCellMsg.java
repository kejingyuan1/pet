package com.petpark.world.dto;

import lombok.Data;

/**
 * WS 单元坐标请求：/app/ws.remove、/app/ws.upgrade {gx, gz}
 */
@Data
public class WsCellMsg {
    private Integer gx;
    private Integer gz;
}
