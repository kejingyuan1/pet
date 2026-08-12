package com.petpark.world.config;

import com.petpark.world.service.RegionBroker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * WS 断线监听：清理区域成员 + 广播 PLAYER_LEAVE（ADR-W2 死 session 防泄漏）
 *
 * 独立 bean（不注入 WebSocketConfig），避免 RegionBroker ↔ SimpMessagingTemplate ↔
 * DelegatingWebSocketMessageBrokerConfiguration ↔ WebSocketConfig 的构造循环。
 */
@Slf4j
@Component
public class WorldSessionListener {

    private final RegionBroker broker;

    public WorldSessionListener(RegionBroker broker) {
        this.broker = broker;
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sid = accessor.getSessionId();
        if (sid != null) {
            log.info("[world] WS 断线 sid={}", sid);
            broker.leave(sid);
        }
    }
}
