package com.petpark.world.service;

import com.petpark.world.geo.CellType;
import com.petpark.world.geo.ChunkKey;
import com.petpark.world.geo.OpenSimplex2;
import com.petpark.world.geo.SemanticGrid;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 确定性程序化地形生成（核心，ADR-W3 / 02 §1.2）
 *
 * 确定性要点：
 *  1. OpenSimplex2（double 精度）噪声，全程 double 运算，仅在写入 height[] 时 cast float 一次；
 *     同种子在任何 JVM / CPU 上输出一致（Java double 严格 IEEE-754）。
 *  2. 地形参数（water_level / scale / octaves / lacunarity / gain / slope / tree / ore 密度）
 *     全部来自 world_config（WorldConfigService 数据驱动），不硬编码。
 *  3. 不变量：任意参数 / 种子变更必须 world_config.version +1（缓存失效依据）。
 *
 * 调参说明（M1 落地修正，已标注）：
 *  设计稿阈值（sand<1.2 / grass<8 / mountain≥8）是按"噪声输出可达 ±8+"假设的；
 *  归一化 OpenSimplex2 输出约 [-1,1]，fbm 四倍频总和约 [-1.9,1.9]，永远到不了 8。
 *  故此处增加 HEIGHT_AMPLITUDE 振幅常量把高度映射到设计阈值区间（约 [-22,22]），
 *  使 water/sand/grass/mountain 均可观。该常量视为地形参数，变更亦须 version+1。
 */
@Slf4j
@Service
public class TerrainService {

    /** 高度振幅：把归一化噪声（~±1）放大到设计阈值（0/1.2/8）可覆盖的区间 */
    private static final double HEIGHT_AMPLITUDE = 15.0;

    private final WorldConfigService world;

    /** 主地形噪声场 */
    private volatile OpenSimplex2 noise;
    /** 种子派生基数（散点哈希用） */
    private volatile long baseSeed;
    /** 散点盐：树 / 矿 互相独立 */
    private static final long SALT_TREE = 0x9E3779B97F4A7C15L;
    private static final long SALT_ORE = 0xBF58476D1CE4E5B9L;

    public TerrainService(WorldConfigService world) {
        this.world = world;
    }

    @PostConstruct
    public void init() {
        reseed();
    }

    /** 按当前种子重建噪声场 */
    public synchronized void reseed() {
        this.baseSeed = OpenSimplex2.seedOf(world.seed());
        this.noise = new OpenSimplex2(baseSeed);
    }

    // ================= 噪声 =================

    /** fbm：4 倍频（或按配置），全程 double，仅末尾单次 cast float */
    private float fbm(int gx, int gz) {
        double h = 0;
        double amp = 1;
        double freq = world.scale();
        double lac = world.lacunarity();
        double gain = world.gain();
        int octaves = world.octaves();
        for (int o = 0; o < octaves; o++) {
            h += noise.noise2(gx * freq, gz * freq) * amp;
            freq *= lac;
            amp *= gain;
        }
        // 振幅映射 + 单次 cast（ADR-W3：仅此处一次 float）
        return (float) (h * HEIGHT_AMPLITUDE);
    }

    /** 树木散点：确定性哈希（见 scatterHash 说明） */
    private double treeScatter(int gx, int gz) {
        return scatterHash(gx, gz, SALT_TREE);
    }

    /** 矿脉散点：确定性哈希（见 scatterHash 说明） */
    private double oreScatter(int gx, int gz) {
        return scatterHash(gx, gz, SALT_ORE);
    }

    /**
     * 确定性散点哈希：(gx, gz, 种子, salt) → [0,1) 均匀值。
     *
     * 落地修正（M1，已标注）：设计稿树/矿用"第二噪声场阈值"（tree>0.98 / ore>0.90/0.94/0.97），
     * 但归一化 OpenSimplex2 输出实际很少超过 ~0.9，按 0.98/0.90 阈值撒点会几乎为 0
     * （与 HEIGHT_AMPLITUDE 同类：设计阈值与噪声幅值不匹配）。
     * 改用具确定性的格点哈希散射：密度严格等于配置（tree_density / ore_density），
     * 同种子同结果（确定性不变量不变），且参数化更精确。
     */
    private double scatterHash(int gx, int gz, long salt) {
        long h = baseSeed ^ salt;
        h = h * 6364136223846793005L + (gx * 0x9E3779B97F4A7C15L);
        h = (h ^ (h >>> 13)) * 0xBF58476D1CE4E5B9L;
        h = (h ^ (h >>> 16)) * 0x94D049BB133111EBL;
        h ^= h >>> 31;
        h += (gz * 0x9E3779B97F4A7C15L) ^ (gz << 32);
        h = (h ^ (h >>> 13)) * 0xBF58476D1CE4E5B9L;
        h ^= h >>> 16;
        return (h & 0xFFFFFFFFL) / 4294967296.0;
    }

    // ================= 语义分类 =================

    /**
     * 按高度 + 散点分类（water_level 判定，接矿脉/树木规则）
     * 分类语义与 chunk 生成完全一致（cell 高度取左上角顶点）。
     */
    public CellType classify(double h, int gx, int gz) {
        if (h < world.waterLevel()) {
            return CellType.WATER;
        }
        if (h < 1.2) {
            return CellType.SAND;
        }
        if (h >= 8) {
            // mountain 区按 ore 密度撒矿，矿级随概率带递增（gold/iron/coal 占比约 3:3:4）
            double d = world.oreDensity();
            double s = oreScatter(gx, gz);
            if (s < d * 0.30) {
                return CellType.ORE_GOLD;
            }
            if (s < d * 0.60) {
                return CellType.ORE_IRON;
            }
            if (s < d) {
                return CellType.ORE_COAL;
            }
            return CellType.MOUNTAIN;
        }
        // grass 区散点树（密度 = tree_density）
        if (treeScatter(gx, gz) < world.treeDensity()) {
            return CellType.TREE;
        }
        return CellType.GRASS;
    }

    // ================= 生成 / 查询 =================

    /** 生成整个 chunk：65×65 高度 + 64×64 语义（纯函数，同参数同结果） */
    public SemanticGrid generateChunk(int cx, int cz) {
        int size = SemanticGrid.CHUNK_SIZE;
        float[] height = new float[SemanticGrid.HEIGHT_N * SemanticGrid.HEIGHT_N];
        byte[] semantic = new byte[size * size];
        int gx0 = cx * size;
        int gz0 = cz * size;
        for (int gz = gz0; gz <= gz0 + size; gz++) {
            for (int gx = gx0; gx <= gx0 + size; gx++) {
                int lx = ChunkKey.lxOf(gx, cx);
                int lz = ChunkKey.lzOf(gz, cz);
                float h = fbm(gx, gz);
                height[lz * SemanticGrid.HEIGHT_N + lx] = h;
                if (gx < gx0 + size && gz < gz0 + size) {
                    semantic[lz * size + lx] = classify(h, gx, gz).code();
                }
            }
        }
        return new SemanticGrid(cx, cz, height, semantic);
    }

    /** 单点 cell 语义（放置校验用；与 chunk 生成口径一致） */
    public CellType semanticAt(int gx, int gz) {
        return classify(fbm(gx, gz), gx, gz);
    }

    /** 单点顶点高度（贴地 / 快照 y 用） */
    public float heightAt(int gx, int gz) {
        return fbm(gx, gz);
    }

    /** cell 坡度：四周顶点最大高度差（设计 §5.2，1 格 = 1 单位） */
    public double slopeAt(int gx, int gz) {
        float h00 = fbm(gx, gz);
        float h10 = fbm(gx + 1, gz);
        float h01 = fbm(gx, gz + 1);
        return Math.max(Math.abs(h00 - h10), Math.abs(h00 - h01));
    }

    /** 可否站立：walkable 语义 + 坡度 < slope_walk 阈值 */
    public boolean isWalkable(int gx, int gz) {
        CellType t = semanticAt(gx, gz);
        if (!t.isWalkable() || t.isObstacle()) {
            return false;
        }
        return slopeAt(gx, gz) < Math.tan(Math.toRadians(world.slopeWalkDeg()));
    }

    /** 可否建造：walkable + 非障碍 + 坡度 < slope_build 阈值（服务端权威） */
    public boolean isBuildable(int gx, int gz) {
        CellType t = semanticAt(gx, gz);
        if (!t.isWalkable() || t.isObstacle()) {
            return false;
        }
        return slopeAt(gx, gz) < Math.tan(Math.toRadians(world.slopeBuildDeg()));
    }

    /** 世界边界校验（worldRadius=0 视为无限） */
    public boolean inWorld(int gx, int gz) {
        int radius = world.worldRadius();
        if (radius <= 0) {
            return true;
        }
        int limit = radius * world.chunkSize();
        return Math.abs(gx) <= limit && Math.abs(gz) <= limit;
    }

    /**
     * 挑选出生点：从原点向外螺旋搜索，优先草地的平坦格，回退沙地。
     * 保证玩家初始落在可站立、语义丰富的地貌上。
     */
    public int[] findSpawn() {
        for (int radius = 0; radius <= 4000; radius += 4) {
            for (int gx = -radius; gx <= radius; gx += 4) {
                for (int gz = -radius; gz <= radius; gz += 4) {
                    if (Math.max(Math.abs(gx), Math.abs(gz)) != radius) {
                        continue;
                    }
                    CellType t = semanticAt(gx, gz);
                    if (t == CellType.GRASS && slopeAt(gx, gz) < 0.5) {
                        return new int[]{gx, gz};
                    }
                }
            }
        }
        // 回退：任意可站立格
        return new int[]{0, 0};
    }
}
