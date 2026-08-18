package com.petpark.world.dto;

import lombok.Data;

/**
 * 世界配置响应（客户端初始化用）
 * spawn: 服务端挑选的可站立出生点（保证玩家落在草地/沙地，能看到语义地貌）。
 */
@Data
public class WorldConfigResp {

    private String seed;
    private int version;
    private int chunkSize;
    private int worldRadius;
    private int spawnGx;
    private int spawnGz;
    private float spawnY;
    /** 客户端默认视距（半径 N，chunk 数） */
    private int viewRadius;
    /** 单房间模式（≤20 全量订阅，ADR-W2） */
    private boolean singleRoom;
    /** 海平面高度（前端水面网格 + 水语义格钳制共用） */
    private double waterLevel;
    /** 服务端权威岛屿中心（前端 HY3D 视觉层对齐，根除前后端岛屿错位） */
    private java.util.List<IslandCenter> islandCenters;

    public WorldConfigResp(String seed, int version, int chunkSize, int worldRadius,
                           int spawnGx, int spawnGz, float spawnY, int viewRadius, boolean singleRoom, double waterLevel) {
        this.seed = seed;
        this.version = version;
        this.chunkSize = chunkSize;
        this.worldRadius = worldRadius;
        this.spawnGx = spawnGx;
        this.spawnGz = spawnGz;
        this.spawnY = spawnY;
        this.viewRadius = viewRadius;
        this.singleRoom = singleRoom;
        this.waterLevel = waterLevel;
    }
}
