package com.petpark.world.service;

import com.petpark.world.entity.TerrainMod;
import com.petpark.world.geo.CellType;
import com.petpark.world.geo.ChunkKey;
import com.petpark.world.geo.OpenSimplex2;
import com.petpark.world.geo.SemanticGrid;
import com.petpark.world.mapper.TerrainModMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.List;

/**
 * 确定性程序化地形生成（核心，ADR-W3 / 02 §1.2）
 *
 * 群岛世界（M3，2026-08-13）：
 *  - 世界主体是一片**海洋**（waterLevel 以下为深海海床）；
 *  - 海面上确定性撒布 ISLAND_COUNT 座**岛屿**（Voronoi 中心 + 径向平滑衰减）；
 *  - 每岛面积较大（半径 115~190 世界单位 ≈ 3.5~6 chunk），足够放置多栋房屋；
 *  - 岛内语义分层：海岸**沙滩**(SAND) → **草地**(GRASS) → **森林**(TREE 密集撒点)
 *    → **山丘/矿脉**(MOUNTAIN/ORE) → 低洼**淡水湖**(WATER)；
 *  - 海洋与湖泊均标记为 WATER，前端统一蓝色渲染（海面另加半透明平面）。
 *
 * 确定性不变量（同种子任何 JVM/CPU 输出一致）保持不变：OpenSimplex2 double 精度 +
 * 仅 heightAt 末尾单次 cast float + 散点哈希确定性。
 */
@Slf4j
@Service
public class TerrainService {

    // ============ 群岛参数（数据驱动，变更须 world_config.version +1） ============
    /** 岛屿数量 */
    private static final int ISLAND_COUNT = 22;
    /** 岛屿中心撒布范围（世界单位，中心落在 ±ISLAND_SPREAD/2 内） */
    private static final double ISLAND_SPREAD = 2600.0;
    /** 岛屿基础半径（世界单位） */
    private static final double ISLAND_BASE_RADIUS = 115.0;
    /** 岛屿半径随机浮动（每岛不同） */
    private static final double ISLAND_RADIUS_VAR = 75.0;
    /** 海洋深度（海床低于水线的深度） */
    private static final double OCEAN_DEPTH = 11.0;
    /** 岛屿中心最大海拔（高于水线的抬升量） */
    private static final double ISLAND_ELEVATION = 17.0;
    /** 岛屿内部细节起伏振幅 */
    private static final double LAND_AMP = 7.0;
    /** 山地阈值（高于水线多少算山，之上有矿脉） */
    private static final double MOUNTAIN_THRESH = 9.0;
    /** 沙滩带宽（高于水线多少内算沙滩） */
    private static final double BEACH_BAND = 1.6;

    private final WorldConfigService world;
    private final TerrainModMapper terrainModMapper;

    /** 主地形噪声场 */
    private volatile OpenSimplex2 noise;
    /** 种子派生基数（散点哈希用） */
    private volatile long baseSeed;
    /** 散点盐：树 / 矿 / 岛屿 互相独立 */
    private static final long SALT_TREE = 0x9E3779B97F4A7C15L;
    private static final long SALT_ORE = 0xBF58476D1CE4E5B9L;
    private static final long SALT_ISLAND = 0x1B873593L;

    /** 岛屿中心（确定性，随种子固定）：cx / cz / 半径 */
    private final double[] islandCx = new double[ISLAND_COUNT];
    private final double[] islandCz = new double[ISLAND_COUNT];
    private final double[] islandR = new double[ISLAND_COUNT];

    public TerrainService(WorldConfigService world, TerrainModMapper terrainModMapper) {
        this.world = world;
        this.terrainModMapper = terrainModMapper;
    }

    @PostConstruct
    public void init() {
        reseed();
    }

    /** 按当前种子重建噪声场 + 岛屿布局 */
    public synchronized void reseed() {
        this.baseSeed = OpenSimplex2.seedOf(world.seed());
        this.noise = new OpenSimplex2(baseSeed);
        this.buildIslands();
    }

    /** 确定性岛屿中心（Voronoi 撒点，均匀分布 + 半径浮动） */
    private void buildIslands() {
        for (int i = 0; i < ISLAND_COUNT; i++) {
            double hx = scatterHash(i * 3 + 1, 777, SALT_ISLAND);
            double hz = scatterHash(i * 3 + 2, 888, SALT_ISLAND);
            double hr = scatterHash(i * 3 + 3, 999, SALT_ISLAND);
            islandCx[i] = (hx - 0.5) * ISLAND_SPREAD;
            islandCz[i] = (hz - 0.5) * ISLAND_SPREAD;
            islandR[i] = ISLAND_BASE_RADIUS + hr * ISLAND_RADIUS_VAR;
        }
        log.info("[world] 群岛生成完成：{} 座岛屿，撒布范围 ±{}，半径 {}~{}",
                ISLAND_COUNT, (long) (ISLAND_SPREAD / 2),
                String.format("%.1f", ISLAND_BASE_RADIUS),
                String.format("%.1f", ISLAND_BASE_RADIUS + ISLAND_RADIUS_VAR));
    }

    // ================= 噪声 =================

    /** 细节噪声：多倍频 fbm 原始和（约 [-1.9,1.9]，不放大不偏移），供岛内起伏 */
    private double detailNoise(int gx, int gz) {
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
        return h;
    }

    /** 内陆湖泊噪声（独立于地形，低频），返回 [0,1) */
    private double lakeNoise(int gx, int gz) {
        double n = noise.noise2(gx * 0.012 + 500, gz * 0.012 + 500);
        return (n + 1) / 2;
    }

    /** 岛屿径向衰减：最近岛心的平滑衰减（中心 1 → 边缘 0），岛外返回 0
     *  M4 增强：加域变形（domain warping）打破完美圆形，让岛屿边缘不规则/有海湾半岛 */
    private double islandFalloff(int gx, int gz) {
        double best = 0;
        for (int i = 0; i < ISLAND_COUNT; i++) {
            // 域变形：用低频噪声偏移查询点，产生不规则岛缘
            double warpScale = 0.04;
            double warpAmp = 35.0;
            double wx = gx + noise.noise2(gx * warpScale + i * 100, gz * warpScale) * warpAmp;
            double wz = gz + noise.noise2(gz * warpScale + i * 200, gx * warpScale) * warpAmp;
            double dx = wx - islandCx[i];
            double dz = wz - islandCz[i];
            double d = Math.sqrt(dx * dx + dz * dz);
            // 半径也加轻微噪声变化（同岛不同方向粗细不同）
            double angleNoise = noise.noise2(Math.atan2(dz, dx) * 2.5 + i * 50, d * 0.02);
            double r = islandR[i] * (1.0 + angleNoise * 0.25);
            if (d >= r) {
                continue;
            }
            double t = 1.0 - d / r;          // 1 at center → 0 at edge
            double f = t * t * (3 - 2 * t);  // smoothstep 平滑
            if (f > best) {
                best = f;
            }
        }
        return best;
    }

    /** 树木散点：确定性哈希 */
    private double treeScatter(int gx, int gz) {
        return scatterHash(gx, gz, SALT_TREE);
    }

    /** 矿脉散点：确定性哈希 */
    private double oreScatter(int gx, int gz) {
        return scatterHash(gx, gz, SALT_ORE);
    }

    /**
     * 确定性散点哈希：(gx, gz, 种子, salt) → [0,1) 均匀值。
     * 密度严格等于配置（tree_density / ore_density），同种子同结果。
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

    // ================= 高度场 =================

    /** 高度场（群岛版）：岛外深海，岛内径向抬升 + 细节起伏 + 内陆湖泊 + 河流雕刻 */
    public float heightAt(int gx, int gz) {
        double falloff = islandFalloff(gx, gz);
        double detail = detailNoise(gx, gz); // ~[-2,2]
        double wl = world.waterLevel();
        if (falloff <= 0.001) {
            // 纯海洋：海床（水线以下 OCEAN_DEPTH，带轻微起伏）
            return (float) (wl - OCEAN_DEPTH + detail * 0.7);
        }
        // 岛内：径向抬升（falloff 越大越高）+ 细节扰动
        double elevation = falloff * (ISLAND_ELEVATION + detail * LAND_AMP);
        float h = (float) (wl + elevation);

        // v8 边缘平滑过渡带：falloff 在 0.02~0.15 区间内，从海床平滑过渡到陆地高度
        // 防止岛屿边缘出现垂直蓝色悬崖
        if (falloff < 0.15) {
            float landH = h;
            float oceanH = (float) (wl - OCEAN_DEPTH * 0.5 + detail * 0.3); // 浅海床（比深海高）
            // smoothstep blend: 0.02→纯海洋, 0.15→纯陆地
            double t = Math.max(0, Math.min(1, (falloff - 0.02) / 0.13));
            double blend = t * t * (3 - 2 * t); // smoothstep
            h = (float) (oceanH * (1 - blend) + landH * blend);
        }

        // 内陆湖泊：仅限真正的洼地（四周高+中间低）才能蓄水
        // 算法：低频噪声选候选点 + 8邻域高度验证（必须形成闭合盆地）
        if (falloff > 0.3 && h > wl && h < wl + 8) {
            if (isRealBasin(gx, gz)) {
                h = (float) (wl + 0.1); // 湖面略高于海线（高原湖），减少深度差
            }
        }
        return h;
    }

    // ================= 湖泊系统（M5，2026-08-13 真洼地版） =================

    /** 真洼地检测：该格是否为可蓄水的闭合盆地
     *  条件：8邻域高度全部 > 中心格 + 噪声候选 + 在岛内中低地区域 + 深度限制防悬崖水
     *  防止斜坡/山腰出现悬浮湖泊/垂直水墙
     */
    private boolean isRealBasin(int gx, int gz) {
        double wl = world.waterLevel();
        double ln = lakeNoise(gx, gz);
        if (ln > 0.42) return false; // 噪声预筛选：只有 ~18% 候选进入邻域验证
        float centerH = heightAtNoLake(gx, gz);
        if (centerH < wl || centerH > wl + 7) return false;
        // 核心：8邻域必须全部高于中心（形成闭合盆地）
        int higherCount = 0;
        double maxNeighborDiff = 0; // 记录最大邻域高差（用于防悬崖水墙）
        for (int dz = -1; dz <= 1; dz++) {
            for (int dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dz == 0) continue;
                float nh = heightAtNoLake(gx + dx, gz + dz);
                double diff = nh - centerH;
                if (diff > maxNeighborDiff) maxNeighborDiff = diff;
                if (nh > centerH + 0.4) higherCount++;
            }
        }
        if (higherCount < 7) return false; // >=7/8 邻域更高（允许1个缺口做出水口）
        // v7 防悬崖水墙：邻域与中心高度差不能超过 3.5 单位（否则形成垂直蓝墙）
        if (maxNeighborDiff > 3.5) return false;
        // 必须在岛内较深处（falloff > 0.4），防止海岸边缘出现水柱
        if (islandFalloff(gx, gz) < 0.4) return false;
        return true;
    }

    /** 不含湖泊影响的高度（供 isRealBasin 引用，避免循环依赖） */
    private float heightAtNoLake(int gx, int gz) {
        double falloff = islandFalloff(gx, gz);
        double detail = detailNoise(gx, gz);
        double wl = world.waterLevel();
        if (falloff <= 0.001) {
            return (float) (wl - OCEAN_DEPTH + detail * 0.7);
        }
        double elevation = falloff * (ISLAND_ELEVATION + detail * LAND_AMP);
        return (float) (wl + elevation);
    }

    // ================= 语义分类 =================

    /**
     * 按高度 + 岛屿归属 + 散点分类（water_level 判定，接矿脉/树木规则）
     * 分类语义与 chunk 生成完全一致（cell 高度取左上角顶点）。
     *
     * 安全兜底（M3 修复）：WATER 语义格高度不得超过 waterLevel + 0.3，
     * 超出说明是误判（假洼地/边缘混合区），自动降级为 GRASS，防止"蓝色陆地"渲染 BUG。
     */
    public CellType classify(double h, int gx, int gz) {
        double wl = world.waterLevel();
        if (h < wl) {
            return CellType.WATER; // 海洋 / 深湖（低于水线）
        }
        double falloff = islandFalloff(gx, gz);
        if (falloff < 0.02) {
            // 极薄陆地视为海洋（防破碎小岛穿帮）
            return CellType.WATER;
        }
        // 沙滩带（海岸）
        if (h < wl + BEACH_BAND) {
            return CellType.SAND;
        }
        // 山地 + 矿脉
        if (h >= wl + MOUNTAIN_THRESH) {
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
        // 内陆淡水湖：仅限真洼地（8邻域均高于中心，形成闭合盆地）
        if (isRealBasin(gx, gz)) {
            return CellType.WATER;
        }
        // 森林 / 草地
        if (treeScatter(gx, gz) < world.treeDensity()) {
            return CellType.TREE;
        }
        return CellType.GRASS;
    }

    /**
     * 安全兜底包装（M3 修复）：防止任何代码路径产生"高于水线的 WATER 语义格"。
     * 若 classify 结果为 WATER 但高度明显高于水线（> wl + 0.3），强制降级为 GRASS。
     * 这能拦截 isRealBasin 假阳性、边缘混合区溢出等所有边界 case。
     */
    public CellType classifySafe(double h, int gx, int gz) {
        CellType t = classify(h, gx, gz);
        if (t == CellType.WATER && h > world.waterLevel() + 0.3) {
            return CellType.GRASS; // 高地不应是水，降级为草地
        }
        return t;
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
                float h = heightAt(gx, gz);
                height[lz * SemanticGrid.HEIGHT_N + lx] = h;
                if (gx < gx0 + size && gz < gz0 + size) {
                    semantic[lz * size + lx] = classifySafe(h, gx, gz).code();
                }
            }
        }
        // 叠加玩家地形修改（采矿/挖填）：已采格按 new_type 覆盖（M4）
        // 迟到客户端加载 chunk 时也能看到已被采空的矿格（ore → empty），无需前端额外处理
        String ck = ChunkKey.of(cx, cz);
        List<TerrainMod> mods = terrainModMapper.listByChunk(ck);
        if (mods != null) {
            for (TerrainMod m : mods) {
                int lx = ChunkKey.lxOf(m.getGx(), cx);
                int lz = ChunkKey.lzOf(m.getGz(), cz);
                if (lx >= 0 && lx < size && lz >= 0 && lz < size) {
                    semantic[lz * size + lx] = CellType.ofName(m.getNewType()).code();
                }
            }
        }
        return new SemanticGrid(cx, cz, height, semantic);
    }

    /** 单点 cell 语义（放置校验用；与 chunk 生成口径一致） */
    public CellType semanticAt(int gx, int gz) {
        return classifySafe(heightAt(gx, gz), gx, gz);
    }

    /** cell 坡度：四周顶点最大高度差（设计 §5.2，1 格 = 1 单位） */
    public double slopeAt(int gx, int gz) {
        float h00 = heightAt(gx, gz);
        float h10 = heightAt(gx + 1, gz);
        float h01 = heightAt(gx, gz + 1);
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
     * 挑选出生点：从原点向外螺旋搜索，优先**岛屿内部高地草地**（falloff 高、海拔高），
     * 让玩家初始落在面积较大的岛屿中央平坦区，方便建造与探索。回退沙地/近岛草地。
     */
    public int[] findSpawn() {
        double bestH = Double.NEGATIVE_INFINITY;
        int[] best = {0, 0};
        boolean found = false;
        // 全局扫描 ±1600（覆盖所有岛屿），步长 16，选全局最高草地（= 岛屿内部高地）
        for (int radius = 0; radius <= 1600; radius += 16) {
            for (int gx = -radius; gx <= radius; gx += 16) {
                for (int gz = -radius; gz <= radius; gz += 16) {
                    if (Math.max(Math.abs(gx), Math.abs(gz)) != radius) {
                        continue;
                    }
                    CellType t = semanticAt(gx, gz);
                    if (t == CellType.GRASS && slopeAt(gx, gz) < 0.6) {
                        double h = heightAt(gx, gz);
                        if (h > bestH) {
                            bestH = h;
                            best = new int[]{gx, gz};
                            found = true;
                        }
                    }
                }
            }
            // 不提前退出——必须扫完所有岛屿才能确定全局最高点
        }
        if (found) {
            return best;
        }
        // 回退：最近的非水可站格（SAND/GRASS 且非障碍，坡度不限；仍无则 (0,0)）
        for (int radius = 0; radius <= 4000; radius += 8) {
            for (int gx = -radius; gx <= radius; gx += 8) {
                for (int gz = -radius; gz <= radius; gz += 8) {
                    if (Math.max(Math.abs(gx), Math.abs(gz)) != radius) {
                        continue;
                    }
                    CellType t = semanticAt(gx, gz);
                    if ((t == CellType.SAND || t == CellType.GRASS) && !t.isObstacle()) {
                        return new int[]{gx, gz};
                    }
                }
            }
        }
        return new int[]{0, 0};
    }
}
