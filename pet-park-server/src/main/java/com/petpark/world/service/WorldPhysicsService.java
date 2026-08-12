package com.petpark.world.service;

import com.petpark.world.geo.CellType;
import com.petpark.world.mapper.PhysicsSnapshotMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * 服务端权威物理引擎（ADR-W7 候选② 内嵌版，2026-08-12）
 *
 * 替代原 Node Rapier WASM physics-service：纯 Java 实现，零额外进程/端口
 * 能力：
 *  - 角色 60Hz tick：消费输入 → 速度积分 → 位置更新（贴地 y=heightAt + 0.7）
 *  - 语义碰撞：基于 TerrainService.semanticAt(cell) 不可走则阻挡
 *  - 10Hz POSITION 广播到 /topic/players
 *  - 同步 broker.players[uid].gx/gz/y/rot 让 join 快照也带最新位置
 *  - 持久化：tick 5s 写 MySQL 快照
 *
 * 输入协议：dx/dz ∈ [-1,1]（相对相机前方+右方），run=true 加速
 */
@Slf4j
@Service
public class WorldPhysicsService {

    private final TerrainService terrain;
    private final WorldConfigService world;
    private final RegionBroker regionBroker;
    @Autowired private SimpMessagingTemplate messaging;
    /** 物理快照持久化（崩溃恢复，M2 核心功能） */
    private final PhysicsSnapshotMapper snapshotMapper;

    private static class Player {
        long uid;
        double gx, gz, y;
        double rot;
        double vx, vz, vy;  // vy = 垂直速度（跳跃用）
        boolean grounded;     // 是否着地（防止连跳）
        long lastTick;
    }
    private final Map<Long, Player> players = new ConcurrentHashMap<>();
    private final Map<Long, ConcurrentLinkedQueue<double[]>> inputQueues = new ConcurrentHashMap<>();
    /** uid → broker sessionId 映射（用于写回 broker.players） */
    private final Map<Long, String> uid2sid = new ConcurrentHashMap<>();
    private volatile long tick = 0;
    private static final double FIXED_DT = 1.0 / 60.0;
    /** 重力加速度（世界单位/s²） */
    private static final double GRAVITY = 25.0;
    /** 跳跃初速度 */
    private static final double JUMP_VEL = 8.5;
    private long lastSnapshotAt = System.currentTimeMillis();

    public WorldPhysicsService(TerrainService terrain, WorldConfigService world,
                               RegionBroker regionBroker, PhysicsSnapshotMapper snapshotMapper) {
        this.terrain = terrain; this.world = world; this.regionBroker = regionBroker;
        this.snapshotMapper = snapshotMapper;
    }

    /** 注册玩家（join 时调） */
    public void addPlayer(long uid, String sessionId, double gx, double gz, double y) {
        Player p = new Player();
        p.uid = uid; p.gx = gx; p.gz = gz; p.y = y; p.rot = 0;
        p.vx = 0; p.vz = 0; p.vy = 0; p.grounded = true;
        players.put(uid, p);
        inputQueues.put(uid, new ConcurrentLinkedQueue<>());
        if (sessionId != null) uid2sid.put(uid, sessionId);
        log.info("[physics-J] add uid={} pos=({}, {}, {})", uid, gx, gz, y);
    }

    public void removePlayer(long uid) {
        players.remove(uid); inputQueues.remove(uid); uid2sid.remove(uid);
    }

    /** 上行输入（dx/dz 方向 + run 加速 + jump 跳跃） */
    public void enqueueInput(long uid, double dx, double dz, boolean run) {
        enqueueInput(uid, dx, dz, run, false);
    }

    /** 带动作的输入（jump=true 触发跳跃） */
    public void enqueueInput(long uid, double dx, double dz, boolean run, boolean jump) {
        ConcurrentLinkedQueue<double[]> q = inputQueues.get(uid);
        if (q == null) return;
        q.offer(new double[]{dx, dz, run ? 1.0 : 0.0, jump ? 1.0 : 0.0});
    }

    /** 60Hz 主循环 */
    @Scheduled(fixedRate = 1000L / 60)
    public void tick() {
        tick++;
        double dt = FIXED_DT;
        for (Player p : players.values()) {
            ConcurrentLinkedQueue<double[]> q = inputQueues.get(p.uid);
            double dx = 0, dz = 0, runScale = 0;
            boolean wantJump = false;
            if (q != null) {
                double[] msg;
                while ((msg = q.poll()) != null) { dx = msg[0]; dz = msg[1]; runScale = msg[2]; if (msg.length > 3 && msg[3] > 0.5) wantJump = true; }
            }
            // 跳跃：着地时给向上初速度
            if (wantJump && p.grounded) {
                p.vy = JUMP_VEL;
                p.grounded = false;
            }
            // 水平移动（同前）
            double speed = (runScale > 0.5) ? 7.0 : 4.0;
            p.vx = dx * speed; p.vz = dz * speed;
            double ngx = p.gx + p.vx * dt, ngz = p.gz + p.vz * dt;
            // 语义碰撞：尝试移动 → 不行则单轴
            if (canStand((int)Math.floor(ngx), (int)Math.floor(ngz))) {
                p.gx = ngx; p.gz = ngz;
            } else if (canStand((int)Math.floor(ngx), (int)Math.floor(p.gz))) {
                p.gx = ngx;
            } else if (canStand((int)Math.floor(p.gx), (int)Math.floor(ngz))) {
                p.gz = ngz;
            }
            if (Math.abs(p.vx) > 0.01 || Math.abs(p.vz) > 0.01) p.rot = Math.atan2(p.vx, p.vz);
            // 垂直物理：重力 + 地面碰撞
            double groundY = terrain.heightAt((int)Math.floor(p.gx), (int)Math.floor(p.gz)) + 0.7;
            if (!p.grounded) {
                p.vy -= GRAVITY * dt; // 重力
                p.y += p.vy * dt;
                // 落地检测
                if (p.y <= groundY) {
                    p.y = groundY;
                    p.vy = 0;
                    p.grounded = true;
                }
            } else {
                p.y = groundY; // 着地时始终贴地
            }
        }
        // 10Hz 广播：批量 POSITION_SNAPSHOT 到 /topic/world（前端 WorldPhysicsService 订阅此 topic）
        long now = System.currentTimeMillis();
        if (now - lastSnapshotAt >= 100) { // 10Hz
            lastSnapshotAt = now;
            // 写回 broker.PlayerInfo（让 snapshot() 拿得到最新）
            for (Player p : players.values()) {
                String sid = uid2sid.get(p.uid);
                if (sid != null) {
                    RegionBroker.PlayerInfo info = regionBroker.getPlayers().get(sid);
                    if (info != null) { info.gx = (int)p.gx; info.gz = (int)p.gz; info.y = p.y; info.rot = p.rot; }
                }
            }
            // 构建批量 bodies 数组，按前端期望格式发送
            if (messaging != null && !players.isEmpty()) {
                java.util.List<Map<String, Object>> bodies = new java.util.ArrayList<>();
                for (Player p : players.values()) {
                    bodies.add(java.util.Map.of(
                        "uid", p.uid, "gx", p.gx, "gz", p.gz, "y", p.y,
                        "rot", p.rot, "vx", p.vx, "vz", p.vz));
                }
                messaging.convertAndSend("/topic/world", java.util.Map.of(
                    "t", "POSITION_SNAPSHOT", "tick", tick, "bodies", bodies));
            }
        }
    }

    private boolean canStand(int gx, int gz) {
        if (!terrain.inWorld(gx, gz)) return false;
        CellType t = terrain.semanticAt(gx, gz);
        if (!t.isWalkable() || t.isObstacle()) return false;
        return terrain.slopeAt(gx, gz) < Math.tan(Math.toRadians(world.slopeWalkDeg()));
    }

    /** 每 5s 写 MySQL 快照（崩溃恢复，M2 核心功能） */
    @Scheduled(fixedRate = 5000)
    public void persistSnapshot() {
        if (players.isEmpty()) return;
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (Player p : players.values()) {
            if (!first) sb.append(",");
            sb.append(String.format("{\"uid\":%d,\"x\":%.2f,\"y\":%.2f,\"z\":%.2f,\"r\":%.3f}",
                p.uid, p.gx, p.y, p.gz, p.rot));
            first = false;
        }
        sb.append("]");
        com.petpark.world.entity.PhysicsSnapshot snap = new com.petpark.world.entity.PhysicsSnapshot();
        snap.setChunkKey("__all__");
        snap.setTick(tick);
        snap.setSnapshot(sb.toString().getBytes());
        snap.setBodyCount(players.size());
        snapshotMapper.insert(snap);
        snapshotMapper.deleteOlder("__all__");
    }

    public Map<Long, Player> getPlayers() { return players; }
    public long getTick() { return tick; }
}
