package com.petpark.world.dto;

import lombok.Data;

/**
 * 物理输入上行：/app/ws.input {seq, move:{dx,dz,run}, action?}
 * 客户端不上行位置、只上行输入意图（ADR-W7 候选②）；dx/dz ∈ [-1,1] 世界空间方向。
 */
@Data
public class WsInputMsg {

    /** 客户端输入序号（调试/排序用；physics-service 按到达序 FIFO 消费） */
    private Long seq;

    private Move move;

    /** 预留：动作意图（build/mine 等，M4） */
    private String action;

    @Data
    public static class Move {
        private Double dx;
        private Double dz;
        private Boolean run;
    }
}
