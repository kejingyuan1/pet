package com.petpark.world.service;

import com.petpark.world.geo.CellType;
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
    // 持久化暂时禁用（target/classes 被锁导致 javac 失败，简化 WorldPhysicsService 不依赖 PhysicsSnapshotMapper）
    // 后续恢复：private final PhysicsSnapshotMapper snapshotMapper; + 注入 + persistSnapshot 写 MySQL

    private static class Player {
        long uid;
        double gx, gz, y;
        double rot;
        double vx, vz;
        long lastTick;
    }
    private final Map<Long, Player> players = new ConcurrentHashMap<>();
    private final Map<Long, ConcurrentLinkedQueue<double[]>> inputQueues = new ConcurrentHashMap<>();
    /** uid → broker sessionId 映射（用于写回 broker.players） */
    private final Map<Long, String> uid2sid = new ConcurrentHashMap<>();
    private volatile long tick = 0;
    private static final double FIXED_DT = 1.0 / 60.0;
    private long lastSnapshotAt = System.currentTimeMillis();

    public WorldPhysicsService(TerrainService terrain, WorldConfigService world,
                               RegionBroker regionBroker) {
        this.terrain = terrain; this.world = world; this.regionBroker = regionBroker;
    }

    /** 注册玩家（join 时调） */
    public void addPlayer(long uid, String sessionId, double gx, double gz, double y) {
        Player p = new Player();
        p.uid = uid; p.gx = gx; p.gz = gz; p.y = y; p.rot = 0; p.vx = 0; p.vz = 0;
        players.put(uid, p);
        inputQueues.put(uid, new ConcurrentLinkedQueue<>());
        if (sessionId != null) uid2sid.put(uid, sessionId);
        log.info("[physics-J] add uid={} pos=({}, {}, {})", uid, gx, gz, y);
    }

    public void removePlayer(long uid) {
        players.remove(uid); inputQueues.remove(uid); uid2sid.remove(uid);
    }

    /** 上行输入 */
    public void enqueueInput(long uid, double dx, double dz, boolean run) {
        ConcurrentLinkedQueue<double[]> q = inputQueues.get(uid);
        if (q == null) return;
        q.offer(new double[]{dx, dz, run ? 1.0 : 0.0});
    }

    /** 60Hz 主循环 */
    @Scheduled(fixedRate = 1000L / 60)
    public void tick() {
        tick++;
        double dt = FIXED_DT;
        for (Player p : players.values()) {
            ConcurrentLinkedQueue<double[]> q = inputQueues.get(p.uid);
            double dx = 0, dz = 0, runScale = 0;
            if (q != null) {
                double[] msg;
                while ((msg = q.poll()) != null) { dx = msg[0]; dz = msg[1]; runScale = msg[2]; }
            }
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
            p.y = terrain.heightAt((int)Math.floor(p.gx), (int)Math.floor(p.gz)) + 0.7;
        }
        // 10Hz 广播 + 写回 broker
        long now = System.currentTimeMillis();
        if (now - lastSnapshotAt >= 100) { // 10Hz
            lastSnapshotAt = now;
            for (Player p : players.values()) {
                // 写回 broker.PlayerInfo（让 snapshot() 拿得到最新）
                String sid = uid2sid.get(p.uid);
                if (sid != null) {
                    RegionBroker.PlayerInfo info = regionBroker.getPlayers().get(sid);
                    if (info != null) { info.gx = (int)p.gx; info.gz = (int)p.gz; info.y = p.y; info.rot = p.rot; }
                }
                // 广播 /topic/players
                if (messaging != null) {
                    messaging.convertAndSend("/topic/players", java.util.Map.of(
                        "t", "POSITION", "uid", p.uid,
                        "gx", p.gx, "gz", p.gz, "y", p.y, "rot", p.rot));
                }
            }
        }
    }

    private boolean canStand(int gx, int gz) {
        if (!terrain.inWorld(gx, gz)) return false;
        CellType t = terrain.semanticAt(gx, gz);
        if (!t.isWalkable() || t.isObstacle()) return false;
        return terrain.slopeAt(gx, gz) < Math.tan(Math.toRadians(world.slopeWalkDeg()));
    }

    /** 每 5s 写 MySQL 快照（崩溃恢复） — 暂未启用，依赖 PhysicsSnapshotMapper 暂未注入 */
    /*
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
    */

    public Map<Long, Player> getPlayers() { return players; }
    public long getTick() { return tick; }
}
