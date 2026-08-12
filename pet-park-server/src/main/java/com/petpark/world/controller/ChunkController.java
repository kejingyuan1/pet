package com.petpark.world.controller;

import com.petpark.common.Result;
import com.petpark.world.dto.ChunkResp;
import com.petpark.world.dto.WorldConfigResp;
import com.petpark.world.dto.WorldObjectResp;
import com.petpark.world.geo.SemanticGrid;
import com.petpark.world.service.TerrainService;
import com.petpark.world.service.WorldConfigService;
import com.petpark.world.service.WorldObjectService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 世界 REST：配置 + chunk 流式拉取 + 对象查询
 */
@RestController
@RequestMapping("/api/world")
public class ChunkController {

    private final TerrainService terrain;
    private final WorldConfigService world;
    private final WorldObjectService objectService;

    /** 出生点缓存（世界参数不变则恒等） */
    private volatile int[] spawnCache;

    public ChunkController(TerrainService terrain, WorldConfigService world, WorldObjectService objectService) {
        this.terrain = terrain;
        this.world = world;
        this.objectService = objectService;
    }

    /** GET /api/world/config —— 世界配置 + 出生点（客户端初始化） */
    @GetMapping("/config")
    public Result<WorldConfigResp> config() {
        int[] spawn = spawn();
        return Result.ok(new WorldConfigResp(
                world.seed(), world.version(), world.chunkSize(), world.worldRadius(),
                spawn[0], spawn[1], terrain.heightAt(spawn[0], spawn[1]),
                2, true));
    }

    /** GET /api/world/chunk?cx=&cz= —— 该 chunk 的地形顶点 + 语义 + 对象 */
    @GetMapping("/chunk")
    public Result<ChunkResp> chunk(@RequestParam int cx, @RequestParam int cz) {
        SemanticGrid grid = terrain.generateChunk(cx, cz);
        List<WorldObjectResp> objects = objectService.listByChunk(cx, cz);
        return Result.ok(new ChunkResp(cx, cz, world.version(), grid.height(), grid.semantic(), objects));
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
}
