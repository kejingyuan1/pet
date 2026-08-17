package com.petpark.world.dto;

import lombok.Data;

/**
 * 钓鱼上行消息：/app/ws.fish {gx, gz}
 * gx/gz 为玩家当前所在世界格（服务端以物理权威位置校验是否临水）。
 */
@Data
public class WsFishMsg {
    /** 玩家所在世界格 X */
    private Integer gx;
    /** 玩家所在世界格 Z */
    private Integer gz;
}
