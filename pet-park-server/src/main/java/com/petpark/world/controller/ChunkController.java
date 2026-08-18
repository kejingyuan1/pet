package com.petpark.world.controller;

import com.petpark.common.Result;
import com.petpark.world.dto.ChunkResp;
import com.petpark.world.dto.WorldConfigResp;
import com.petpark.world.dto.WorldObjectResp;
import com.petpark.world.entity.WorldChunk;
import com.petpark.world.geo.ChunkKey;
import com.petpark.world.geo.SemanticGrid;
import com.petpark.world.mapper.WorldChunkMapper;
import com.petpark.world.service.TerrainService;
import com.petpark.world.service.WorldConfigService;
import com.petpark.world.service.WorldObjectService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.List;

/**
 * 世界 REST：配置 + chunk 流式拉取 + 对象查询
 */
@Slf4j
@RestController
@RequestMapping("/api/world")
public class ChunkController {

    private final TerrainService terrain;
    private final WorldConfigService world;
    private final WorldObjectService objectService;
    private final WorldChunkMapper chunkMapper;

    /** 出生点缓存（世界参数不变则恒等） */
    private volatile int[] spawnCache;

    public ChunkController(TerrainService terrain, WorldConfigService world,
                           WorldObjectService objectService, WorldChunkMapper chunkMapper) {
        this.terrain = terrain;
        this.world = world;
        this.objectService = objectService;
        this.chunkMapper = chunkMapper;
    }

    /** GET /api/world/config —— 世界配置 + 出生点 + 服务端权威岛屿中心（客户端初始化） */
    @GetMapping("/config")
    public Result<WorldConfigResp> config() {
        int[] spawn = spawn();
        WorldConfigResp resp = new WorldConfigResp(
                world.seed(), world.version(), world.chunkSize(), world.worldRadius(),
                spawn[0], spawn[1], terrain.heightAt(spawn[0], spawn[1]),
                2, true, world.waterLevel());
        resp.setIslandCenters(terrain.islandCenters());
        return Result.ok(resp);
    }

    /**
     * GET /api/world/chunk?cx=&cz= —— 该 chunk 的地形顶点 + 语义 + 对象
     * P2 审计缺口 #6：优先读 world_chunks 缓存（按 chunk_key+version），未命中再程序化生成并落库。
     */
    @GetMapping("/chunk")
    public Result<ChunkResp> chunk(@RequestParam int cx, @RequestParam int cz) {
        String key = ChunkKey.of(cx, cz);
        int version = world.version();
        // 优先读缓存
        WorldChunk cached = chunkMapper.selectByKeyVersion(key, version);
        if (cached != null && cached.getHeightBlob() != null && cached.getSemanticBlob() != null) {
            float[] height = bytesToFloats(cached.getHeightBlob());
            byte[] semantic = cached.getSemanticBlob();
            List<WorldObjectResp> objects = objectService.listByChunk(cx, cz);
            return Result.ok(new ChunkResp(cx, cz, version, height, semantic, objects));
        }
        // 缓存未命中：程序化生成 + 落库（失败不影响本次返回）
        SemanticGrid grid = terrain.generateChunk(cx, cz);
        List<WorldObjectResp> objects = objectService.listByChunk(cx, cz);
        try {
            WorldChunk wc = new WorldChunk();
            wc.setChunkKey(key);
            wc.setCx(cx);
            wc.setCz(cz);
            wc.setHeightBlob(floatsToBytes(grid.height()));
            wc.setSemanticBlob(grid.semantic());
            wc.setVersion(version);
            chunkMapper.insert(wc);
        } catch (Exception e) {
            log.warn("[world] chunk 缓存落库失败（忽略） key={} {}", key, e.getMessage());
        }
        return Result.ok(new ChunkResp(cx, cz, version, grid.height(), grid.semantic(), objects));
    }

    /** GET /api/world/objects?cx=&cz= —— 单独拉某 chunk 的对象（增量刷新用） */
    @GetMapping("/objects")
    public Result<List<WorldObjectResp>> objects(@RequestParam int cx, @RequestParam int cz) {
        return Result.ok(objectService.listByChunk(cx, cz));
    }

    private int[] spawn() {
        int[] s = spawnCache;
        if (s == null) {
            synchronized (this) {
                s = spawnCache;
                if (s == null) {
                    s = terrain.findSpawn();
                    spawnCache = s;
                }
            }
        }
        return s;
    }

    // ================= chunk 缓存编解码（BIG_ENDIAN float32） =================
    private static byte[] floatsToBytes(float[] f) {
        ByteBuffer bb = ByteBuffer.allocate(f.length * 4).order(ByteOrder.BIG_ENDIAN);
        for (float v : f) bb.putFloat(v);
        return bb.array();
    }

    private static float[] bytesToFloats(byte[] b) {
        ByteBuffer bb = ByteBuffer.wrap(b).order(ByteOrder.BIG_ENDIAN);
        float[] f = new float[b.length / 4];
        for (int i = 0; i < f.length; i++) f[i] = bb.getFloat();
        return f;
    }
}
