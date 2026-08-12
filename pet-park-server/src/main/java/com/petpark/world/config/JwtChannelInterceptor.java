package com.petpark.world.config;

import com.petpark.service.TokenService;
import com.petpark.world.controller.WorldWsController;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

/**
 * STOMP 握手鉴权：CONNECT 时解析 JWT（?token= 或 Authorization 头），
 * 把 userId 存入 session 属性（供 @MessageMapping 读取），并设置 Principal（name=sessionId，
 * 供 /user 用户目的地路由个人回复）。
 */
@Component
public class JwtChannelInterceptor implements ChannelInterceptor {

    private final TokenService tokenService;

    public JwtChannelInterceptor(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String token = accessor.getFirstNativeHeader("token");
            if (token == null) {
                String auth = accessor.getFirstNativeHeader("Authorization");
                if (auth != null && auth.startsWith("Bearer ")) {
                    token = auth.substring(7);
                }
            }
            Long uid = tokenService.parseUserId(token);
            if (uid == null) {
                throw new MessageDeliveryException("WebSocket 鉴权失败：缺少有效 token");
            }
            String sid = accessor.getSessionId();
            // Principal name = sessionId：/user/{sessionId}/queue/reply 可路由到本会话
            accessor.setUser(() -> sid);
            accessor.getSessionAttributes().put(WorldWsController.ATTR_USER_ID, uid);
        }
        return message;
    }
}
