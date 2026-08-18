package com.petpark.world.service;

import com.petpark.world.entity.WorldConfig;
import com.petpark.world.mapper.WorldConfigMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * 世界配置加载（全局一行 world_config，ADR-W3 数据驱动）
 *
 * 启动时从 DB 加载并缓存；若表为空（老库未跑 schema 增量）则回退到与 schema.sql 一致的内存默认值，
 * 保证 TerrainService 始终可用。任意参数变更须 version+1（缓存失效依据）。
 */
@Slf4j
@Service
public class WorldConfigService {

    private final WorldConfigMapper mapper;

    private volatile WorldConfig cfg;

    public WorldConfigService(WorldConfigMapper mapper) {
        this.mapper = mapper;
    }

    @PostConstruct
    public void init() {
        reload();
    }

    /** 重新加载配置（改参数/种子后由运维触发重启即可；M4 可加刷新接口） */
    public synchronized void reload() {
        WorldConfig loaded = mapper.selectById(1L);
        if (loaded == null) {
            log.warn("[world] world_config 表为空，使用内置默认配置（请执行 schema.sql 增量）");
            loaded = defaultConfig();
        }
        this.cfg = loaded;
        log.info("[world] 世界配置加载完成 seed={} version={} waterLevel={} scale={} octaves={}",
                cfg.getSeed(), cfg.getVersion(), cfg.getWaterLevel(), cfg.getScale(), cfg.getOctaves());
    }

    public WorldConfig get() {
        return cfg;
    }

    public String seed() {
        return cfg.getSeed() == null ? "dudu2019" : cfg.getSeed();
    }

    public int version() {
        return cfg.getVersion() == null ? 1 : cfg.getVersion();
    }

    public int chunkSize() {
        return cfg.getChunkSize() == null ? 64 : cfg.getChunkSize();
    }

    /** 世界半径（chunk 数），0 = 无限 */
    public int worldRadius() {
        return cfg.getWorldRadius() == null ? 1024 : cfg.getWorldRadius();
    }

    public double waterLevel() {
        return doubleOf(cfg.getWaterLevel(), 0.0);
    }

    public double treeDensity() {
        return doubleOf(cfg.getTreeDensity(), 0.02);
    }

    public double scale() {
        return doubleOf(cfg.getScale(), 0.004);
    }

    public int octaves() {
        return cfg.getOctaves() == null ? 4 : cfg.getOctaves();
    }

    public double lacunarity() {
        return doubleOf(cfg.getLacunarity(), 2.0);
    }

    public double gain() {
        return doubleOf(cfg.getGain(), 0.5);
    }

    /** walkable 坡度阈值（°） */
    public double slopeWalkDeg() {
        return doubleOf(cfg.getSlopeWalk(), 35.0);
    }

    /** buildable 坡度阈值（°） */
    public double slopeBuildDeg() {
        return doubleOf(cfg.getSlopeBuild(), 15.0);
    }

    public double oreDensity() {
        return doubleOf(cfg.getOreDensity(), 0.03);
    }

    private static double doubleOf(BigDecimal v, double def) {
        return v == null ? def : v.doubleValue();
    }

    /** 内置默认（与 schema.sql 中 world_config 默认值一致） */
    private static WorldConfig defaultConfig() {
        WorldConfig w = new WorldConfig();
        w.setId(1L);
        w.setSeed("dudu2019");
        w.setVersion(3);
        w.setChunkSize(64);
        w.setWorldRadius(1024);
        w.setWaterLevel(new BigDecimal("-5.00"));
        w.setTreeDensity(new BigDecimal("0.005"));
        w.setScale(new BigDecimal("0.00400"));
        w.setOctaves(4);
        w.setLacunarity(new BigDecimal("2.000"));
        w.setGain(new BigDecimal("0.500"));
        w.setSlopeWalk(new BigDecimal("35.00"));
        w.setSlopeBuild(new BigDecimal("15.00"));
        w.setOreDensity(new BigDecimal("0.03"));
        return w;
    }
}
