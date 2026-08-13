package com.petpark.world.dto;

import lombok.Data;

/**
 * 采矿上行消息：/app/ws.mine {gx, gz}
 * gx/gz 为目标矿脉所在世界格（客户端根据邻近矿石计算后发送）。
 */
@Data
public class WsMineMsg {
    /** 目标矿脉世界格 X */
    private Integer gx;
    /** 目标矿脉世界格 Z */
    private Integer gz;
}
