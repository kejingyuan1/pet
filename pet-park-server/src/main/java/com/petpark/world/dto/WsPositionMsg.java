package com.petpark.world.dto;

import lombok.Data;

/**
 * WS 位置心跳：/app/ws.position {gx, gz, y, rot}
 * 客户端节流 1s 上报；服务端做廉价校验（边界内 + walkable）后广播到 /topic/players。
 */
@Data
public class WsPositionMsg {

    private Integer gx;
    private Integer gz;
    private Double y;
    private Double rot;
}
