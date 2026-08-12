package com.petpark.world.controller;

import com.petpark.common.Result;
import com.petpark.entity.User;
import com.petpark.mapper.UserMapper;
import com.petpark.world.dto.WorldObjectResp;
import com.petpark.world.dto.WsBuildMsg;
import com.petpark.world.dto.WsInputMsg;
import com.petpark.world.dto.WsJoinMsg;
import com.petpark.world.dto.WsPositionMsg;
import com.petpark.world.geo.CellType;
import com.petpark.world.geo.ChunkKey;
import com.petpark.world.service.PhysicsGatewayService;
import com.petpark.world.service.RegionBroker;
import com.petpark.world.service.TerrainService;
import com.petpark.world.service.WorldConfigService;
import com.petpark.world.service.WorldObjectService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.util.List;
import java.util.Map;

/**
 * 世界 WS 控制器（STOMP，ADR-W2 / ADR-W7 候选②）
 *
 * 上行：
 *  - /app/ws.join    接入/重连接入握手 → 回 POSITION_SNAPSHOT（含 y）+ 区域对象全量 + version；
 *                    同时把玩家注册进 physics-service（物理权威移动）
 *  - /app/ws.input   物理输入上行：客户端按键/摇杆意图 → Spring Boot 预检 → 转发 physics-service 按 tick 消费
 *  - /app/ws.position 轻量位置心跳（保留：UI/调试/兜底；权威位置以 POSITION_SNAPSHOT 为准）
 *  - /app/ws.build    放置请求（与 REST 同一 service，服务端权威）
 * 下行：
 *  - /topic/world     世界事件（OBJECT_ADD / PLAYER_JOIN / PLAYER_LEAVE / POSITION_SNAPSHOT / PHYS_RESTART）
 *  - /topic/players   玩家位置（POSITION，含 y）
 *  - /user/queue/reply 个人回复（join 快照 / build 结果）
 */
@Slf4j
@Controller
public class WorldWsController {

    public static final String ATTR_USER_ID = "world.userId";

    private final RegionBroker broker;
    private final TerrainService terrain;
    private final WorldConfigService world;
    private final WorldObjectService objectService;
    private final UserMapper userMapper;
    private final PhysicsGatewayService physicsGateway;

    public WorldWsController(RegionBroker broker,
                             TerrainService terrain,
                             WorldConfigService world,
                             WorldObjectService objectService,
                             UserMapper userMapper,
                             PhysicsGatewayService physicsGateway) {
        this.broker = broker;
        this.terrain = terrain;
        this.world = world;
        this.objectService = objectService;
        this.userMapper = userMapper;
        this.physicsGateway = physicsGateway;
    }

    /** 接入握手：加区域 → 回快照（含 y）+ 广播 PLAYER_JOIN */
    @MessageMapping("/ws.join")
    public void join(WsJoinMsg msg, SimpMessageHeaderAccessor headers) {
        String sid = headers.getSessionId();
        Long uid = uid(headers);
        if (sid == null || uid == null) {
            return;
        }
        String chunkKey = msg.getChunkKey();
        int cx;
        int cz;
        if (chunkKey != null && chunkKey.matches("-?\\d+_-?\\d+")) {
            String[] parts = chunkKey.split("_");
            cx = Integer.parseInt(parts[0]);
            cz = Integer.parseInt(parts[1]);
        } else if (msg.getGx() != null && msg.getGz() != null) {
            cx = ChunkKey.cxOf(msg.getGx());
            cz = ChunkKey.czOf(msg.getGz());
            chunkKey = ChunkKey.of(cx, cz);
        } else {
            return;
        }
        int gx = msg.getGx() != null ? msg.getGx() : cx * world.chunkSize();
        int gz = msg.getGz() != null ? msg.getGz() : cz * world.chunkSize();
        double y = terrain.heightAt(gx, gz);
        double rot = 0.0;

        String nick = "";
        User u = userMapper.selectById(uid);
        if (u != null) {
            nick = u.getNickname() == null ? "" : u.getNickname();
        }

        broker.join(sid, chunkKey, new RegionBroker.PlayerInfo(uid, nick, gx, gz, y, rot));
        broker.touch(sid);

        // 物理权威：把玩家注册进 physics-service（capsule 贴地，随快照下行）
        physicsGateway.onPlayerJoin(uid, gx, gz, y);

        // 回快照：区域内全部玩家（含 y）+ 区域对象全量 + version
        List<WorldObjectResp> objects = objectService.listByChunkKey(chunkKey);
        broker.sendToUser(sid, broker.snapshot(sid, world.version(), objects));

        // 广播玩家加入
        broker.broadcastWorld(Map.of(
                "t", "PLAYER_JOIN",
                "uid", uid,
                "nickname", nick,
                "gx", gx, "gz", gz,
                "y", y, "rot", rot));
        log.info("[world] WS join sid={} uid={} region={} @({},{})", sid, uid, chunkKey, gx, gz);
    }

    /** 物理输入上行：/app/ws.input {seq, move:{dx,dz,run}} → 预检 → 转发 physics-service（ADR-W7 候选②） */
    @MessageMapping("/ws.input")
    public void input(WsInputMsg msg, SimpMessageHeaderAccessor headers) {
        Long uid = uid(headers);
        if (uid == null || msg == null || msg.getMove() == null) {
            return;
        }
        // 输入预检：方向向量界内（客户端可作弊的值域钳制；物理结果由 physics-service 权威求解）
        double dx = clampUnit(msg.getMove().getDx());
        double dz = clampUnit(msg.getMove().getDz());
        boolean run = Boolean.TRUE.equals(msg.getMove().getRun());
        if (dx == 0 && dz == 0 && !run && !"jump".equals(msg.getAction())) {
            // 仍转发（表示松键停止），保证 physics-service 消费到"停止"意图
        }
        physicsGateway.sendInput(uid, dx, dz, run, msg.getAction());
    }

    private static double clampUnit(Double v) {
        if (v == null || v.isNaN() || v.isInfinite()) return 0;
        return Math.max(-1.0, Math.min(1.0, v));
    }

    /** 位置心跳：廉价校验（边界 + 非水/障碍）→ 节流广播 */
    @MessageMapping("/ws.position")
    public void position(WsPositionMsg msg, SimpMessageHeaderAccessor headers) {
        String sid = headers.getSessionId();
        if (sid == null || msg.getGx() == null || msg.getGz() == null) {
            return;
        }
        int gx = msg.getGx();
        int gz = msg.getGz();
        if (!terrain.inWorld(gx, gz)) {
            return; // 瞬移越界：忽略
        }
        // 轻量校验：目标 cell 为水/障碍则忽略（拦阻下水/穿树作弊；cozy 级别）
        CellType t = terrain.semanticAt(gx, gz);
        if (t == CellType.WATER || t.isObstacle()) {
            return;
        }
        double y = msg.getY() != null ? msg.getY() : terrain.heightAt(gx, gz);
        double rot = msg.getRot() != null ? msg.getRot() : 0.0;
        if (broker.updatePosition(sid, gx, gz, y, rot)) {
            broker.broadcastPlayerPosition(sid);
        }
    }

    /** 放置请求（WS 通道，与 REST 同一权威 service） */
    @MessageMapping("/ws.build")
    public void build(WsBuildMsg msg, SimpMessageHeaderAccessor headers) {
        String sid = headers.getSessionId();
        Long uid = uid(headers);
        if (sid == null || uid == null || msg.getGx() == null || msg.getGz() == null
                || msg.getObjectType() == null || msg.getObjectType().isBlank()) {
            return;
        }
        try {
            Result<WorldObjectResp> r = objectService.placeBuild(uid, msg.getGx(), msg.getGz(),
                    msg.getObjectType(), msg.getRot());
            broker.sendToUser(sid, Map.of("t", "BUILD_RESULT", "code", r.getCode(), "msg", r.getMsg()));
        } catch (Exception e) {
            broker.sendToUser(sid, Map.of("t", "BUILD_RESULT", "code", 1, "msg", e.getMessage()));
        }
    }

    private Long uid(SimpMessageHeaderAccessor headers) {
        Object v = headers.getSessionAttributes() == null ? null : headers.getSessionAttributes().get(ATTR_USER_ID);
        return v instanceof Number n ? n.longValue() : null;
    }
}
