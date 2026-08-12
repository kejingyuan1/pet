package com.petpark.world.dto;

import lombok.Data;

/**
 * WS 接入握手：/app/ws.join {chunkKey 或 gx,gz}
 * 服务端 RegionBroker.join 后回 POSITION_SNAPSHOT（含 y）+ 区域对象全量 + version。
 */
@Data
public class WsJoinMsg {

    private String chunkKey;
    private Integer gx;
    private Integer gz;
}
