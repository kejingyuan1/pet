package com.petpark.world.config;

import com.petpark.world.controller.WorldWsController;
import com.petpark.world.service.PhysicsGatewayService;
import com.petpark.world.service.RegionBroker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * WS 断线监听：清理区域成员 + 广播 PLAYER_LEAVE + 通知 physics-service 移除玩家物理体
 * （ADR-W2 死 session 防泄漏；ADR-W7 物理体生命周期跟随连接）
 *
 * 独立 bean（不注入 WebSocketConfig），避免 RegionBroker ↔ SimpMessagingTemplate ↔
 * DelegatingWebSocketMessageBrokerConfiguration ↔ WebSocketConfig 的构造循环。
 */
@Slf4j
@Component
public class WorldSessionListener {

    private final RegionBroker broker;
    private final PhysicsGatewayService physicsGateway;

    public WorldSessionListener(RegionBroker broker, PhysicsGatewayService physicsGateway) {
        this.broker = broker;
        this.physicsGateway = physicsGateway;
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String sid = accessor.getSessionId();
        if (sid == null) {
            return;
        }
        Object uidObj = accessor.getSessionAttributes() == null
                ? null : accessor.getSessionAttributes().get(WorldWsController.ATTR_USER_ID);
        log.info("[world] WS 断线 sid={} uid={}", sid, uidObj);
        broker.leave(sid);
        if (uidObj instanceof Number n) {
            physicsGateway.onPlayerLeave(n.longValue());
        }
    }
}
