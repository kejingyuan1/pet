package com.petpark.world.dto;

import lombok.Data;

/**
 * WS 区域聊天：/app/ws.chat {text}
 * 服务端校验 uid + 非空 + 限长（≤200）后广播 CHAT 到 /topic/world（single-room 全可见）。
 * 聊天仅广播不落库（cozy 游戏，历史非必需）；如需留存可后续加 world_chat 表。
 */
@Data
public class WsChatMsg {

    /** 聊天内容（已 trim，服务端再限长兜底） */
    private String text;
}
