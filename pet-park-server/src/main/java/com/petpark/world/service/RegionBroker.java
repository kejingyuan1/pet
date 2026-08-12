package com.petpark.world.service;

import com.petpark.world.dto.WorldObjectResp;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 区域广播管理（ADR-W2 骨架，线程安全）
 *
 * 结构：
 *  - regions：外层 ConcurrentHashMap<chunkKey, Set<sessionId>>，
 *             内层 ConcurrentHashMap.newKeySet()（防并发修改异常）；
 *  - sessionChunk：反向表 sessionId → 当前 chunkKey（断线/剔除据此移除，避免死 session 泄漏）；
 *  - players：sessionId → 玩家信息（uid/nickname/位置/心跳时间）。
 *
 * 广播模型：
 *  - single-room（≤20 默认 true）= "R 覆盖全世界"的特例，事件广播到 /topic/world，全部订阅者可见；
 *  - 非 single-room 时按 chunkKey 广播到 /topic/region.{chunkKey}（预留半径 R 分片，逻辑不变）。
 *  - 玩家位置广播到 /topic/players，服务端按 session 节流 1s。
 *  - 服务端 Scheduled 扫描，>30s 无活动 → 移除区域 + 广播 PLAYER_LEAVE（ADR-W2）。
 */
@Slf4j
@Component
public class RegionBroker {

    /** 玩家信息（内存态，不落库；位置为会话态） */
    public static class PlayerInfo {
        public final Long uid;
        public final String nickname;
        public volatile int gx;
        public volatile int gz;
        public volatile double y;
        public volatile double rot;
        public volatile long lastActivity;
        public volatile long lastPosBroadcast;

        public PlayerInfo(Long uid, String nickname, int gx, int gz, double y, double rot) {
            this.uid = uid;
            this.nickname = nickname;
            this.gx = gx;
            this.gz = gz;
            this.y = y;
            this.rot = rot;
            this.lastActivity = System.currentTimeMillis();
        }
    }

    private final ConcurrentHashMap<String, Set<String>> regions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> sessionChunk = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, PlayerInfo> players = new ConcurrentHashMap<>();

    /** 给 PhysicsGatewayService 反查 uid→sessionId（写回位置状态） */
    public java.util.Map<String, PlayerInfo> getPlayers() { return players; }

    private final SimpMessagingTemplate messaging;

    @Value("${petpark.ws.single-room:true}")
    private boolean singleRoom = true;

    @Value("${petpark.ws.idle-timeout-ms:30000}")
    private long idleTimeoutMs = 30000;

    public RegionBroker(SimpMessagingTemplate messaging) {
        this.messaging = messaging;
    }

    /** 加入区域：更新反向表 + 加入新区域集合（线程安全） */
    public void join(String sessionId, String chunkKey, PlayerInfo info) {
        String old = sessionChunk.put(sessionId, chunkKey);
        if (old != null && !old.equals(chunkKey)) {
            regions.computeIfPresent(old, (k, v) -> {
                v.remove(sessionId);
                return v.isEmpty() ? null : v;
            });
        }
        regions.computeIfAbsent(chunkKey, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
        players.put(sessionId, info);
        log.debug("[world] session {} join region {}", sessionId, chunkKey);
    }

    /** 离开区域（断线/剔除）：从旧区域与 players 移除 */
    public void leave(String sessionId) {
        String old = sessionChunk.remove(sessionId);
        if (old != null) {
            regions.computeIfPresent(old, (k, v) -> {
                v.remove(sessionId);
                return v.isEmpty() ? null : v;
            });
        }
        PlayerInfo removed = players.remove(sessionId);
        if (removed != null) {
            broadcastWorld(Map.of(
                    "t", "PLAYER_LEAVE",
                    "uid", removed.uid));
        }
        log.debug("[world] session {} leave region {}", sessionId, old);
    }

    /** 心跳刷新活动时间 */
    public void touch(String sessionId) {
        PlayerInfo p = players.get(sessionId);
        if (p != null) {
            p.lastActivity = System.currentTimeMillis();
        }
    }

    /**
     * 更新玩家位置；返回是否需要广播（每 session 节流 ≥1s）。
     * 服务端不模拟物理，仅做廉价校验（边界 + walkable 由调用方负责）。
     */
    public boolean updatePosition(String sessionId, int gx, int gz, double y, double rot) {
        PlayerInfo p = players.get(sessionId);
        if (p == null) {
            return false;
        }
        p.gx = gx;
        p.gz = gz;
        p.y = y;
        p.rot = rot;
        p.lastActivity = System.currentTimeMillis();
        long now = p.lastActivity;
        if (now - p.lastPosBroadcast >= 1000) {
            p.lastPosBroadcast = now;
            return true;
        }
        return false;
    }

    /** 广播玩家位置（/topic/players，含 y —— review 缺口 #4 已补） */
    public void broadcastPlayerPosition(String sessionId) {
        PlayerInfo p = players.get(sessionId);
        if (p == null) {
            return;
        }
        messaging.convertAndSend("/topic/players", Map.of(
                "t", "POSITION",
                "uid", p.uid,
                "nickname", p.nickname == null ? "" : p.nickname,
                "gx", p.gx, "gz", p.gz,
                "y", p.y, "rot", p.rot));
    }

    /** 广播世界事件（对象增删/地形变化/玩家进出） */
    public void broadcastWorld(Object payload) {
        if (singleRoom) {
            messaging.convertAndSend("/topic/world", payload);
        } else {
            log.warn("[world] 非 single-room 模式尚未启用分片路由，事件仅发 /topic/world");
            messaging.convertAndSend("/topic/world", payload);
        }
    }

    /** 按 chunkKey 广播（非 single-room 时用；single-room 退化到全量） */
    public void broadcast(String chunkKey, Object payload) {
        broadcastWorld(payload);
    }

    /** 构造 POSITION_SNAPSHOT：区域内全部玩家（含 y）+ 区域对象 + version，发给指定 session */
    public Map<String, Object> snapshot(String sessionId, int version, List<WorldObjectResp> objects) {
        List<Map<String, Object>> playerList = new ArrayList<>();
        for (PlayerInfo p : players.values()) {
            playerList.add(Map.of(
                    "uid", p.uid,
                    "nickname", p.nickname == null ? "" : p.nickname,
                    "gx", p.gx, "gz", p.gz,
                    "y", p.y, "rot", p.rot));
        }
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("t", "POSITION_SNAPSHOT");
        snap.put("version", version);
        snap.put("players", playerList);
        snap.put("objects", objects);
        return snap;
    }

    /** 向指定 session 发送私有回复（join 快照） */
    public void sendToUser(String sessionId, Object payload) {
        messaging.convertAndSendToUser(sessionId, "/queue/reply", payload);
    }

    public PlayerInfo player(String sessionId) {
        return players.get(sessionId);
    }

    public boolean isSingleRoom() {
        return singleRoom;
    }

    /**
     * 空闲剔除：>30s 无活动 → 移除区域 + PLAYER_LEAVE。
     * 后台标签页定时器被节流可能误剔，cozy 游戏可接受（ADR-W2 已标注）。
     */
    @Scheduled(fixedDelay = 15000)
    public void sweepIdle() {
        long now = System.currentTimeMillis();
        List<String> expired = new ArrayList<>();
        for (Map.Entry<String, PlayerInfo> e : players.entrySet()) {
            if (now - e.getValue().lastActivity > idleTimeoutMs) {
                expired.add(e.getKey());
            }
        }
        for (String sid : expired) {
            log.info("[world] 空闲剔除 session {}", sid);
            leave(sid);
        }
    }
}
