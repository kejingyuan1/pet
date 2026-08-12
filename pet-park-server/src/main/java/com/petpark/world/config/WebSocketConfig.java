package com.petpark.world.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * STOMP WebSocket 配置（ADR-W2）
 *
 *  - Endpoint: /ws（原生 WebSocket；前端用 ?token= 传 JWT）
 *  - 握手拦截器把查询参数 token 存入 session attributes（供 JwtChannelInterceptor 读取）
 *  - 应用前缀 /app（上行）、广播前缀 /topic（下行）、用户前缀 /user（个人回复）
 *  - 入站通道挂 JWT 拦截器做握手鉴权
 *  - 断线清理在 WorldSessionListener（独立 bean，避免与 RegionBroker 的构造循环）
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    public static final String ATTR_WS_TOKEN = "ws.token";

    private final JwtChannelInterceptor jwtChannelInterceptor;

    public WebSocketConfig(JwtChannelInterceptor jwtChannelInterceptor) {
        this.jwtChannelInterceptor = jwtChannelInterceptor;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // 简单内存 Broker：/topic 广播、/queue 用户队列
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // 原生 WebSocket（无 SockJS fallback；M1 浏览器均可直连）
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .addInterceptors(tokenHandshakeInterceptor());
    }

    /** 握手拦截器：把 URL 查询参数 ?token= 存入 session attributes（原生 WS 无法带自定义头） */
    private HandshakeInterceptor tokenHandshakeInterceptor() {
        return new HandshakeInterceptor() {
            @Override
            public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                           WebSocketHandler wsHandler, Map<String, Object> attributes) {
                String query = request.getURI().getQuery();
                if (query != null) {
                    for (String pair : query.split("&")) {
                        String[] kv = pair.split("=", 2);
                        if (kv.length == 2 && "token".equals(kv[0])) {
                            attributes.put(ATTR_WS_TOKEN, URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
                        }
                    }
                }
                return true;
            }

            @Override
            public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                       WebSocketHandler wsHandler, Exception exception) {
                // 无需处理
            }
        };
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(jwtChannelInterceptor);
    }
}
