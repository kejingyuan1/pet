package com.petpark.world.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 世界配置表（全局一行：种子/版本/边界/生成参数）
 *
 * ADR-W3 不变量：任意地形参数 / 种子变更必须 version+1，否则新旧 chunk 视觉接缝。
 * 参数全部数据驱动（不再硬编码），加载后由 TerrainService 缓存。
 */
@Data
@TableName("world_config")
public class WorldConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 世界种子（改种子 = 新世界） */
    private String seed;

    /** 世界版本（客户端重载依据） */
    private Integer version;

    /** chunk 边长（世界格），默认 64 */
    private Integer chunkSize;

    /** 世界半径（chunk 数，0 = 无限） */
    private Integer worldRadius;

    /** 水位线（h < 此值 = 水） */
    private BigDecimal waterLevel;

    /** 草地区树木密度（0-1） */
    private BigDecimal treeDensity;

    /** fbm 基础频率 */
    private BigDecimal scale;

    /** fbm 倍频 */
    private Integer octaves;

    /** fbm 频率倍增 */
    private BigDecimal lacunarity;

    /** fbm 振幅衰减 */
    private BigDecimal gain;

    /** walkable 坡度阈值（°） */
    private BigDecimal slopeWalk;

    /** buildable 坡度阈值（°） */
    private BigDecimal slopeBuild;

    /** mountain 区矿脉密度（0-1） */
    private BigDecimal oreDensity;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
