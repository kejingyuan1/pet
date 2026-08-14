package com.petpark.world.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 世界 chunk 缓存（P2 审计缺口 #6）：地形生成结果落库，避免每次请求重复程序化生成。
 * height_blob：65×65 顶点高度 float32（BIG_ENDIAN，4225×4B）；
 * semantic_blob：64×64 语义 byte（4096B）。
 */
@Data
@TableName("world_chunks")
public class WorldChunk {

    @TableId(type = IdType.AUTO)
    private Long id;
    /** chunk 标识：cx_cz */
    private String chunkKey;
    private Integer cx;
    private Integer cz;
    private byte[] heightBlob;
    private byte[] semanticBlob;
    private Integer version;
    private LocalDateTime genAt;
}
