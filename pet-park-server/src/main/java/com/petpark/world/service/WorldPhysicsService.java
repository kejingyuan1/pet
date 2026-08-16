package com.petpark.world.service;

import com.petpark.world.geo.CellType;
import com.petpark.world.entity.PhysicsSnapshot;
import com.petpark.world.mapper.PhysicsSnapshotMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
        boolean inWater;      // 🔴 P1 游泳：是否处于水中（浮力模式）
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
    /** 🔴 P1 游泳浮力重力：水中大幅削弱（仅用于把玩家稳稳压在水面附近，避免无限下沉/飞出） */
    private static final double GRAVITY_BUOY = 6.0;
    /** 跳跃初速度 */
    private static final double JUMP_VEL = 8.5;
    /** 自动上台阶的最大高度差（世界单位/格）：着地时邻格高度差 ≤ 此值即可走上去
     *  🔴 2026-08-16 1.5→3.0 放宽：原值卡太严，稍有小坡就挡住 WASD（用户反馈） */
    private static final double STEP_HEIGHT = 3.0;
    /** 🔴 岛内台阶限宽（HY3D 视觉岛面平滑，旧网格起伏不代表真实坡度，岛内大幅放宽） */
    private static final double STEP_HEIGHT_ISLAND = 6.0;
    /** 🔴 岛内可走坡度（°）——同上，旧网格 slopeAt 在岛内不可信 */
    private static final double SLOPE_WALK_DEG_ISLAND = 55.0;
    /** 🔴 2026-08-16 空气墙根治：岛内坡地/山体不再按坡度或台阶高差拦截。
     *   仅当单格向上攀爬超过 CLIMB_HEIGHT（真正的垂直绝壁）才视为不可走；
     *   正常地形/山体的单格高差远小于此，玩家可自由行走，由 tick 把 y 贴到地面高度。 */
    private static final double CLIMB_HEIGHT = 9.0;
    private long lastSnapshotAt = System.currentTimeMillis();
    /** 上一帧 tick 的真实时间戳（纳秒），用于计算与帧率无关的 dt（2026-08-16 修复行走过慢） */
    private long lastTickNanos = 0;

    public WorldPhysicsService(TerrainService terrain, WorldConfigService world,
                               RegionBroker regionBroker, PhysicsSnapshotMapper snapshotMapper) {
        this.terrain = terrain; this.world = world; this.regionBroker = regionBroker;
        this.snapshotMapper = snapshotMapper;
    }

    /** 注册玩家（join 时调）：优先用 MySQL 快照恢复上次位置，无记录才用 spawn */
    public void addPlayer(long uid, String sessionId, double gx, double gz, double y) {
        // M2 真实持久化恢复：从最近一次全量快照按 uid 命中上次坐标（崩溃/重启后回到离开处）
        double[] restored = restorePosition(uid);
        if (restored != null) {
            gx = restored[0]; gz = restored[1]; y = restored[2];
            log.info("[physics-J] restore uid={} from snapshot pos=({}, {}, {})", uid, gx, gz, y);
        }
        // 🔴 y 值合理性校验：MySQL 脏数据或异常值会导致 y=-798 之类极端值
        //   → 广播到前端 → 触发落水保护 → 推回 → 下一帧又是 -798 → 死循环打转
        //   正常地形高度范围约 [-20, 30]（含海床-16~高山26），留宽裕余量
        if (y < -50.0 || y > 100.0 || Double.isNaN(y) || Double.isInfinite(y)) {
            log.warn("[physics-J] y value out of range for uid={} y={}, recalculating from terrain", uid, y);
            y = terrain.heightAt((int)Math.floor(gx), (int)Math.floor(gz));
        }
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

    /**
     * 从 MySQL 全量快照恢复玩家上次位置（M2 真实持久化恢复）。
     * 返回 {gx, gz, y}；无记录/解析失败/坐标非法（在水或障碍上）返回 null。
     * 地形为确定性生成，旧坐标长期有效；仍做落点合法性校验兜底。
     */
    public double[] restorePosition(long uid) {
        try {
            PhysicsSnapshot snap = snapshotMapper.selectLatest("__all__");
            if (snap == null || snap.getSnapshot() == null) return null;
            String json = new String(snap.getSnapshot(), java.nio.charset.StandardCharsets.UTF_8);
            ObjectMapper om = new ObjectMapper();
            JsonNode root = om.readTree(json);
            if (root.isArray()) {
                for (JsonNode n : root) {
                    if (n.has("uid") && n.get("uid").asLong() == uid) {
                        double gx = n.get("x").asDouble();
                        double gz = n.get("z").asDouble();
                        double y = n.get("y").asDouble();
                        int igx = (int) Math.floor(gx), igz = (int) Math.floor(gz);
                        if (!terrain.inWorld(igx, igz)) return null;
                        CellType t = terrain.semanticAt(igx, igz);
                        if (t == CellType.WATER || t.isObstacle()) return null;
                        double wl = terrain.getWaterLevel();
                        if (y < wl + 2.0) {
                            log.info("[physics-J] restore uid={} rejected: y={} below safe (wl={})", uid, y, wl);
                            return null;
                        }
                        // 🔴 陆地连通性校验：5×5 内 >= 60% 是陆地（拒绝水上孤岛/窄半岛上的旧存档）
                        int landCnt = 0, total = 0;
                        for (int dx = -2; dx <= 2; dx++) {
                            for (int dz = -2; dz <= 2; dz++) {
                                total++;
                                CellType ct = terrain.semanticAt(igx + dx, igz + dz);
                                if (ct != CellType.WATER) landCnt++;
                            }
                        }
                        if ((double) landCnt / total < 0.60) {
                            log.info("[physics-J] restore uid={} rejected: isolated position ({},{}) land={}/{}", uid, gx, gz, landCnt, total);
                            return null;
                        }
                        return new double[]{gx, gz, y};
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[physics-J] restore position failed uid={}: {}", uid, e.getMessage());
        }
        return null;
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
        // 🔴 2026-08-16 修复：用真实流逝时间算 dt，避免 Spring 调度实际帧率低于 60Hz 时
        //   移动距离被按比例压缩（之前固定 FIXED_DT=1/60 → 实际 30Hz 时行走速度只有一半）。
        long nowN = System.nanoTime();
        double dt = FIXED_DT;
        if (lastTickNanos != 0) {
            dt = Math.min(0.05, Math.max(1.0 / 120.0, (nowN - lastTickNanos) / 1_000_000_000.0));
        }
        lastTickNanos = nowN;
        for (Player p : players.values()) {
            ConcurrentLinkedQueue<double[]> q = inputQueues.get(p.uid);
            double dx = 0, dz = 0, runScale = 0;
            boolean wantJump = false;
            boolean gotInput = false;
            if (q != null) {
                double[] msg;
                while ((msg = q.poll()) != null) { dx = msg[0]; dz = msg[1]; runScale = msg[2]; if (msg.length > 3 && msg[3] > 0.5) wantJump = true; gotInput = true; }
            }
            // 跳跃：着地时给向上初速度
            if (wantJump && p.grounded) {
                p.vy = JUMP_VEL;
                p.grounded = false;
            }
            // 🔴🔴 P1 真3D 水系统：水域判定（当前格为水，或岛外地形低于水面 → 处于水中）
            int cgx = (int) Math.floor(p.gx), cgz = (int) Math.floor(p.gz);
            CellType curT = terrain.semanticAt(cgx, cgz);
            double wl = terrain.getWaterLevel();
            boolean onIsland = terrain.onIslandCore(cgx, cgz);
            boolean inWater = terrain.inWorld(cgx, cgz)
                    && ((curT == CellType.WATER || curT == CellType.RIVER)
                        || (!onIsland && terrain.heightAt(cgx, cgz) < wl));
            p.inWater = inWater;

            double speed = (runScale > 0.5) ? 9.0 : 4.0;
            if (inWater) speed *= 0.5; // 🔴 P1 游泳速度减半（浮力阻力）

            // 🔴 2026-08-16 修复（WASD 几乎不动的根因）：着地行走时，若本 tick 没有新输入帧
            //   绝不能清零速度——否则输入频率(≈30Hz)低于物理 tick(60Hz)时，约一半 tick 把速度归零，
            //   玩家只在"恰好含输入帧"的 tick 挪一小步 → 行走又慢又卡，相机跟随下看起来"按了没反应"。
            //   正确做法：收到新输入才更新速度；收到显式停止(dx=dz=0，客户端松键发的 idle 帧)才停；
            //   否则保留上一帧速度持续行走（速度大小恒为 speed，与帧率/输入频率无关）。
            if (gotInput) {
                if (dx != 0 || dz != 0) {
                    p.vx = dx * speed; p.vz = dz * speed;
                } else {
                    p.vx = 0; p.vz = 0; // 客户端显式松键停止
                }
            }
            double ngx = p.gx + p.vx * dt, ngz = p.gz + p.vz * dt;
            // 碰撞：尝试整步移动 → 不行则单轴（台阶/斜坡也允许）
            if (canEnter(p, (int)Math.floor(ngx), (int)Math.floor(ngz))) {
                p.gx = ngx; p.gz = ngz;
            } else if (canEnter(p, (int)Math.floor(ngx), (int)Math.floor(p.gz))) {
                p.gx = ngx;
            } else if (canEnter(p, (int)Math.floor(p.gx), (int)Math.floor(ngz))) {
                p.gz = ngz;
            }
            if (Math.abs(p.vx) > 0.01 || Math.abs(p.vz) > 0.01) p.rot = Math.atan2(p.vx, p.vz);
            // 🔴🔴 P1 垂直物理：分水中浮力 / 陆地重力两套
            if (inWater) {
                // 浮力：玩家浮在水面 (waterLevel 略上方)，平滑贴合，弱重力把人稳稳压在水面。
                double floatY = wl + 0.3;
                if (p.grounded) {
                    p.y = floatY;
                } else {
                    // 蹬水/跳跃：弱重力，钳制在水面附近 ±0.4m，并防止无限下沉
                    p.vy -= GRAVITY_BUOY * dt;
                    p.y += p.vy * dt;
                    if (p.y > floatY + 0.4) { p.y = floatY + 0.4; if (p.vy > 0) p.vy = 0; }
                    if (p.y < wl - 4) { p.y = wl - 4; p.vy = 0; }
                    if (p.y <= floatY) { p.y = floatY; p.vy = 0; p.grounded = true; } // 落回水面=贴面着地
                }
            } else {
                // 垂直物理：重力 + 地面碰撞
                double groundY = terrain.heightAt(cgx, cgz) + 0.7;
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

    /** 移动可达判定（替代原 canStand）：
     *  - 水域允许进入（游泳，P1 真3D 水系统：浮力把玩家稳稳压在水面附近）
     *  - 着地：仅硬障碍(树/岩) 与"真正垂直绝壁"(单格向上攀爬>CLIMB_HEIGHT) 挡路；
     *          坡地/山体/缓坡/下坡一律放行（🔴 2026-08-16 空气墙根治，不再按坡度角或台阶高差拦截）
     *  - 空中：飞越所有非水格（矿脉/树/岩均可跳过），实现"跳过障碍"
     */
    private static final double JUMP_CLEARANCE = 0.6; // 离地超过此高度视为"在飞越"

    private boolean canEnter(Player p, int gx, int gz) {
        if (!terrain.inWorld(gx, gz)) return false;
        CellType t = terrain.semanticAt(gx, gz);

        // 🔴 P1 真3D 水系统：水域允许进入（游泳）。仅放行碰撞，运动学/浮力由 tick 单独处理，
        //   玩家会被浮力稳稳压在水面（waterLevel 附近），而非"踏水行走"或沉底。
        if (t == CellType.WATER || t == CellType.RIVER) return true;

        double curH = terrain.heightAt((int) Math.floor(p.gx), (int) Math.floor(p.gz));
        double targetH = terrain.heightAt(gx, gz);

        if (p.grounded) {
            // 🔴 2026-08-16 空气墙根治（用户随机走动撞墙）：岛内坡地/山体一律可走，
            //   不再按坡度角或台阶高差拦截。原 onIslandCore/slopeAt/step 三重判定会把
            //   HY3D 平滑岛面上的"假陡坡"误判成绝壁 → WASD 走不动（只能跳着走）。
            //   现在仅两种情形挡路：
            //     1) 硬障碍(树/岩)：t.isObstacle() → 实体占位，必须绕行；
            //     2) 真正的垂直绝壁：单格向上攀爬 > CLIMB_HEIGHT（正常地形/山体单格高差远小于此，
            //        平滑地形里永远不会触发，仅作安全护栏防止"一步登天"）。
            //   下坡/平路/缓坡/山体全部放行；垂直 y 由 tick 把玩家贴到目标格地面高度。
            if (t.isObstacle()) return false;
            double climb = targetH - curH; // 仅向上的台阶需要护栏，向下永远放行
            if (climb > CLIMB_HEIGHT) return false;
            return true;
        }

        // 空中状态：只要不是水就可以飞越（上面已排除 WATER）
        // 包含矿脉(ORE_*)、树(TREE)、岩(ROCK)、山(MOUNTAIN) 全部可跳过
        // 落地时由 tick 末尾的地面碰撞把 y 贴回目标格高度
        return true;
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

    /**
     * 采矿邻近校验（M4）：返回玩家当前权威物理位置 {gx, gz}（连续世界坐标）。
     * 未进入世界（未 WS-join）返回 null；WorldMiningService 据此抛 notInWorld。
     */
    public double[] getPlayerPos(long uid) {
        Player p = players.get(uid);
        if (p == null) {
            return null;
        }
        return new double[]{p.gx, p.gz};
    }
}
