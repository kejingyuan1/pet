package com.petpark.world.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.petpark.world.entity.PhysicsSnapshot;
import com.petpark.world.geo.ChunkKey;
import com.petpark.world.geo.SemanticGrid;
import com.petpark.world.mapper.PhysicsSnapshotMapper;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Spring Boot ↔ physics-service 网关（ADR-W7 候选②）
 *
 * 职责：
 *  1. 进程编排：启动时 ProcessBuilder spawn physics-service（或采用已运行实例），心跳 1s 健康检查，
 *     连续失败自动重启 + 从 MySQL 快照 restoreSnapshot 续跑（tick 对齐）+ 广播 PHYS_RESTART；
 *  2. 控制面 HTTP :18080 客户端：/load_world /add_collider /remove_collider /snapshot /restore；
 *  3. 数据面 WS :18081 客户端：输入上行（客户端 → physics-service）、权威快照下行（→ STOMP /topic/world）；
 *  4. 快照持久化：每 5s takeSnapshot → world_physics_snapshot BLOB（覆盖写保留最新）。
 *
 * 说明：physics-service 已在本模块由独立 Node 进程承担模拟，本类不做任何物理求解。
 */
@Slf4j
@Service
public class PhysicsGatewayService {

    private final ObjectMapper json;
    private final SimpMessagingTemplate messaging;
    private final PhysicsSnapshotMapper snapshotMapper;
    private final TerrainService terrain;

    // ------- 配置 -------
    @Value("${petpark.physics.node-bin:C:/Users/WIN11/.workbuddy/binaries/node/versions/22.22.2/node.exe}")
    private String nodeBin;
    @Value("${petpark.physics.service-dir:../physics-service}")
    private String serviceDir;
    @Value("${petpark.physics.control-url:http://127.0.0.1:18080}")
    private String controlUrl;
    @Value("${petpark.physics.data-url:ws://127.0.0.1:18081}")
    private String dataUrl;
    @Value("${petpark.physics.control-port:18080}")
    private int controlPort;
    @Value("${petpark.physics.data-port:18081}")
    private int dataPort;
    @Value("${petpark.physics.heartbeat-ms:1000}")
    private long heartbeatMs;
    @Value("${petpark.physics.heartbeat-fail-threshold:3}")
    private int heartbeatFailThreshold;
    @Value("${petpark.physics.snapshot-db-ms:5000}")
    private long snapshotDbMs;
    @Value("${petpark.physics.spawn-terrain-radius:2}")
    private int spawnTerrainRadius;
    @Value("${petpark.physics.player-radius:0.4}")
    private double playerRadius;
    @Value("${petpark.physics.player-height:1.8}")
    private double playerHeight;
    @Value("${petpark.physics.walk-speed:4.0}")
    private double walkSpeed;
    @Value("${petpark.physics.run-speed:7.0}")
    private double runSpeed;

    private static final String SNAPSHOT_CHUNK_KEY = "global";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();
    private final Map<String, Object> latestPlayerPositions = new ConcurrentHashMap<>();
    private final Map<Long, Long> onlinePlayers = new ConcurrentHashMap<>();

    private Process process;
    private WebSocket dataWs;
    private volatile boolean worldLoaded = false;
    private volatile int heartbeatFails = 0;
    private volatile boolean healthy = false;

    public PhysicsGatewayService(ObjectMapper json,
                                 SimpMessagingTemplate messaging,
                                 PhysicsSnapshotMapper snapshotMapper,
                                 TerrainService terrain) {
        this.json = json;
        this.messaging = messaging;
        this.snapshotMapper = snapshotMapper;
        this.terrain = terrain;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        // 应用就绪后再启动（TerrainService/WorldConfigService 的 @PostConstruct 已执行完）
        // 若已有外部运行的 physics-service（开发手动启动），直接采用；否则 spawn
        try {
            Map<String, Object> health = controlGet("/healthz");
            if (Boolean.TRUE.equals(health.get("ok"))) {
                log.info("[physics] 采用已运行的 physics-service（control={}）", controlUrl);
                this.healthy = true;
            }
        } catch (Exception e) {
            spawnService();
        }
        connectDataPlane();
        loadInitialWorld();
        log.info("[physics] 网关启动完成：control={} data={} node={} serviceDir={}",
                controlUrl, dataUrl, nodeBin, serviceDir);
    }

    @PreDestroy
    public void stop() {
        try { if (dataWs != null) dataWs.sendClose(WebSocket.NORMAL_CLOSURE, "server down").get(1, TimeUnit.SECONDS); } catch (Exception ignored) {}
        if (process != null && process.isAlive()) {
            process.destroy();
            log.info("[physics] 停止 physics-service 子进程");
        }
    }

    // ================= 进程编排 =================

    private void spawnService() {
        try {
            Path dir = Path.of(serviceDir).toAbsolutePath();
            log.info("[physics] spawn physics-service：node={} dir={} ports={}/{}", nodeBin, dir, controlPort, dataPort);
            ProcessBuilder pb = new ProcessBuilder(nodeBin, "src/index.js");
            pb.directory(dir.toFile());
            pb.environment().put("PHYSICS_CONTROL_PORT", String.valueOf(controlPort));
            pb.environment().put("PHYSICS_DATA_PORT", String.valueOf(dataPort));
            pb.redirectOutput(ProcessBuilder.Redirect.INHERIT);
            pb.redirectError(ProcessBuilder.Redirect.INHERIT);
            process = pb.start();
            waitUntilHealthy(10_000);
        } catch (Exception e) {
            log.error("[physics] spawn/等待 physics-service 失败", e);
            this.healthy = false;
        }
    }

    private void waitUntilHealthy(long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            try {
                Map<String, Object> h = controlGet("/healthz");
                if (Boolean.TRUE.equals(h.get("ok"))) {
                    this.healthy = true;
                    this.heartbeatFails = 0;
                    return;
                }
            } catch (Exception ignored) { /* 未就绪 */ }
            sleep(200);
        }
        this.healthy = false;
        log.error("[physics] physics-service 未在 {}ms 内就绪", timeoutMs);
    }

    /** 心跳：连续失败超过阈值 → 重启 + 快照恢复 + 广播 PHYS_RESTART */
    @Scheduled(fixedDelayString = "${petpark.physics.heartbeat-ms:1000}")
    public void heartbeat() {
        if (!worldLoaded) return;
        try {
            Map<String, Object> h = controlGet("/healthz");
            if (Boolean.TRUE.equals(h.get("ok"))) {
                this.healthy = true;
                this.heartbeatFails = 0;
                return;
            }
        } catch (Exception ignored) { /* 失败计入 */ }
        this.heartbeatFails++;
        if (this.heartbeatFails >= this.heartbeatFailThreshold) {
            log.error("[physics] 心跳连续失败 {} 次，重启 physics-service 并从快照恢复", heartbeatFails);
            restartAndRestore();
        }
    }

    private synchronized void restartAndRestore() {
        this.healthy = false;
        this.worldLoaded = false;
        try { if (process != null) process.destroyForcibly(); } catch (Exception ignored) {}
        PhysicsSnapshot snap = snapshotMapper.selectLatest(SNAPSHOT_CHUNK_KEY);
        spawnService();
        connectDataPlane();
        boolean restored = false;
        if (snap != null && snap.getSnapshot() != null && snap.getSnapshot().length > 0) {
            try {
                Map<String, Object> r = controlPostBinary("/restore", snap.getSnapshot(),
                        Map.of("X-Tick", String.valueOf(snap.getTick())));
                log.info("[physics] restoreSnapshot ok tick={} resp={}", snap.getTick(), r);
                restored = true;
            } catch (Exception e) {
                log.error("[physics] restoreSnapshot 失败，回退 loadInitialWorld", e);
            }
        }
        if (this.healthy) {
            this.worldLoaded = true;
            // ⚠️ 修复：restore 失败必须回退全量加载出生点周边地形，否则重启后世界为空
            if (!restored) {
                loadInitialWorld();
            }
            // 重注册在线玩家（用最近已知位置）
            for (Long uid : onlinePlayers.keySet()) {
                Object pos = latestPlayerPositions.get(String.valueOf(uid));
                if (pos instanceof Map<?, ?> m) {
                    double gx = ((Number) m.get("gx")).doubleValue();
                    double gz = ((Number) m.get("gz")).doubleValue();
                    double y = ((Number) m.get("y")).doubleValue();
                    addPlayer(uid, gx, gz, y);
                }
            }
            // 广播重启：客户端清空插值缓冲
            messaging.convertAndSend("/topic/world", Map.of("t", "PHYS_RESTART"));
            log.info("[physics] 重启完成并广播 PHYS_RESTART（restored={}）", restored);
        }
    }

    private void loadInitialWorld() {
        try {
            int[] spawn = terrain.findSpawn();
            List<Map<String, Object>> terrainList = new ArrayList<>();
            int cx0 = ChunkKey.cxOf(spawn[0]);
            int cz0 = ChunkKey.czOf(spawn[1]);
            for (int dz = -spawnTerrainRadius; dz <= spawnTerrainRadius; dz++) {
                for (int dx = -spawnTerrainRadius; dx <= spawnTerrainRadius; dx++) {
                    terrainList.add(terrainPayload(cx0 + dx, cz0 + dz));
                }
            }
            Map<String, Object> body = Map.of(
                    "seed", "dudu2019", "version", 1, "gravityY", -9.81,
                    "bodyBudget", 128,
                    "terrain", terrainList);
            controlPost("/load_world", body);
            this.worldLoaded = true;
            log.info("[physics] /load_world 完成：{} 个 chunk（出生点 ({},{})）", terrainList.size(), spawn[0], spawn[1]);
        } catch (Exception e) {
            log.error("[physics] /load_world 失败", e);
        }
    }

    // ================= 数据面 WS（输入上行 / 快照下行） =================

    private void connectDataPlane() {
        try {
            WebSocket.Listener listener = new WebSocket.Listener() {
                private final StringBuilder text = new StringBuilder();
                @Override
                public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
                    text.append(data);
                    if (last) {
                        String msg = text.toString();
                        text.setLength(0);
                        try { handleDataMessage(msg); } catch (Exception e) { log.warn("[physics] 数据面消息处理失败", e); }
                    }
                    webSocket.request(1);
                    return null;
                }
                @Override
                public void onError(WebSocket webSocket, Throwable error) {
                    log.warn("[physics] 数据面 WS 错误: {}", error.getMessage());
                }
            };
            this.dataWs = http.newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .buildAsync(URI.create(dataUrl), listener)
                    .get(5, TimeUnit.SECONDS);
            log.info("[physics] 数据面 WS 已连接 {}", dataUrl);
        } catch (Exception e) {
            log.error("[physics] 数据面 WS 连接失败", e);
        }
    }

    private void handleDataMessage(String msg) throws Exception {
        Map<String, Object> obj = json.readValue(msg, Map.class);
        String t = String.valueOf(obj.get("t"));
        if ("snapshot".equals(t)) {
            long tick = obj.get("tick") instanceof Number n ? n.longValue() : 0L;
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> bodies = (List<Map<String, Object>>) obj.get("bodies");
            if (bodies != null) {
                for (Map<String, Object> b : bodies) {
                    long uid = ((Number) b.get("uid")).longValue();
                    latestPlayerPositions.put(String.valueOf(uid), Map.of(
                            "gx", ((Number) b.get("gx")).doubleValue(),
                            "gz", ((Number) b.get("gz")).doubleValue(),
                            "y", ((Number) b.get("y")).doubleValue()));
                }
            }
            messaging.convertAndSend("/topic/world", Map.of(
                    "t", "POSITION_SNAPSHOT", "tick", tick, "bodies", bodies == null ? List.of() : bodies));
        }
    }

    // ================= 对外 API（Spring 其他组件调用） =================

    /** 玩家输入上行（客户端 → physics-service） */
    public void sendInput(long uid, double dx, double dz, boolean run) {
        if (dataWs == null || !onlinePlayers.containsKey(uid)) return;
        try {
            dataWs.sendText(json.writeValueAsString(Map.of(
                    "t", "input", "uid", uid, "dx", dx, "dz", dz, "run", run)), true);
        } catch (Exception e) {
            log.warn("[physics] 输入转发失败 uid={}", uid, e);
        }
    }

    /** 玩家接入：注册物理体 + 确保周边地形已加载 */
    public void onPlayerJoin(long uid, double gx, double gz, double y) {
        onlinePlayers.put(uid, System.currentTimeMillis());
        latestPlayerPositions.put(String.valueOf(uid), Map.of("gx", gx, "gz", gz, "y", y));
        if (!worldLoaded) return;
        int cx = ChunkKey.cxOf((int) Math.floor(gx));
        int cz = ChunkKey.czOf((int) Math.floor(gz));
        ensureTerrainAround(cx, cz, 1);
        addPlayer(uid, gx, gz, y);
    }

    public void onPlayerLeave(long uid) {
        onlinePlayers.remove(uid);
        try { controlPost("/remove_collider", Map.of("type", "player", "uid", uid)); } catch (Exception ignored) {}
    }

    /** 放置成功 → 通知 physics-service 增静态碰撞体（在事务提交后调用） */
    public void notifyObjectPlaced(long id, int gx, int gz, String type, double baseY) {
        if (!worldLoaded) return;
        Map<String, Object> he = "fish_pond".equals(type)
                ? Map.of("hx", 0.9, "hy", 0.3, "hz", 0.9)
                : Map.of("hx", 0.8, "hy", 1.0, "hz", 0.8);
        try {
            controlPost("/add_collider", Map.of(
                    "type", "object", "id", id, "gx", gx, "gz", gz,
                    "baseY", baseY, "halfExtents", he, "type", type));
        } catch (Exception e) {
            log.warn("[physics] 通知 add_collider 失败 id={}", id, e);
        }
    }

    /** 确保玩家所在 chunk 周边（radius）已加载到 physics-service */
    public synchronized void ensureTerrainAround(int cx, int cz, int radius) {
        if (!worldLoaded) return;
        for (int dz = -radius; dz <= radius; dz++) {
            for (int dx = -radius; dx <= radius; dx++) {
                int tcx = cx + dx;
                int tcz = cz + dz;
                try {
                    controlPost("/add_collider", terrainPayload(tcx, tcz));
                } catch (Exception e) {
                    log.warn("[physics] 加载 chunk {}_{} 失败", tcx, tcz);
                }
            }
        }
    }

    // ================= 快照持久化（5s） =================

    @Scheduled(fixedDelayString = "${petpark.physics.snapshot-db-ms:5000}")
    public void persistSnapshot() {
        if (!worldLoaded || !healthy) return;
        try {
            HttpResponse<byte[]> resp = http.send(
                    HttpRequest.newBuilder(URI.create(controlUrl + "/snapshot")).GET().build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() != 200) return;
            long tick = Long.parseLong(resp.headers().firstValue("X-Tick").orElse("0"));
            int bodyCount = Integer.parseInt(resp.headers().firstValue("X-Body-Count").orElse("0"));
            PhysicsSnapshot snap = new PhysicsSnapshot();
            snap.setChunkKey(SNAPSHOT_CHUNK_KEY);
            snap.setTick(tick);
            snap.setSnapshot(resp.body());
            snap.setBodyCount(bodyCount);
            snapshotMapper.insert(snap);
            snapshotMapper.deleteOlder(SNAPSHOT_CHUNK_KEY);
        } catch (Exception e) {
            log.warn("[physics] 快照持久化失败", e);
        }
    }

    // ================= 内部 HTTP 工具 =================

    private void addPlayer(long uid, double gx, double gz, double y) {
        try {
            controlPost("/add_collider", Map.of(
                    "type", "player", "uid", uid, "gx", gx, "gz", gz, "y", y));
        } catch (Exception e) {
            log.warn("[physics] add_player 失败 uid={}", uid, e);
        }
    }

    private Map<String, Object> terrainPayload(int cx, int cz) {
        SemanticGrid grid = terrain.generateChunk(cx, cz);
        float[] heights = grid.height();
        List<Float> list = new ArrayList<>(heights.length);
        for (float h : heights) list.add(h);
        return Map.of("type", "terrain_chunk", "chunkKey", ChunkKey.of(cx, cz), "cx", cx, "cz", cz, "heights", list);
    }

    private Map<String, Object> controlGet(String path) throws Exception {
        HttpResponse<String> resp = http.send(
                HttpRequest.newBuilder(URI.create(controlUrl + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) throw new IllegalStateException("HTTP " + resp.statusCode());
        return json.readValue(resp.body(), Map.class);
    }

    private Map<String, Object> controlPost(String path, Object body) throws Exception {
        HttpResponse<String> resp = http.send(
                HttpRequest.newBuilder(URI.create(controlUrl + path))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) throw new IllegalStateException("HTTP " + resp.statusCode());
        return json.readValue(resp.body(), Map.class);
    }

    private Map<String, Object> controlPostBinary(String path, byte[] bytes, Map<String, String> headers) throws Exception {
        HttpRequest.Builder rb = HttpRequest.newBuilder(URI.create(controlUrl + path))
                .header("Content-Type", "application/octet-stream")
                .POST(HttpRequest.BodyPublishers.ofByteArray(bytes));
        headers.forEach(rb::header);
        HttpResponse<String> resp = http.send(rb.build(), HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) throw new IllegalStateException("HTTP " + resp.statusCode() + " body=" + resp.body());
        return json.readValue(resp.body(), Map.class);
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
    }
}
