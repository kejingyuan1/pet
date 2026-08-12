package com.petpark.world.dto;

import lombok.Data;

import java.util.List;

/**
 * chunk 响应：height（65×65 顶点高度）+ semantic（64×64 cell 语义码）+ 该 chunk 内对象
 * JSON 数组直接下发（M1 简单可读；大范围预生成后可按需改 base64 压缩，属 M4 优化）。
 */
@Data
public class ChunkResp {

    private int cx;
    private int cz;
    /** 世界版本（变化则客户端整体重载） */
    private int version;
    /** 65×65 = 4225 个顶点高度 */
    private float[] height;
    /** 64×64 = 4096 个 cell 语义码（CellType.code，0..255 的 int，JSON 数组下发） */
    private int[] semantic;
    /** 该 chunk 内玩家对象（建筑/鱼塘） */
    private List<WorldObjectResp> objects;

    public ChunkResp(int cx, int cz, int version, float[] height, byte[] semantic, List<WorldObjectResp> objects) {
        this.cx = cx;
        this.cz = cz;
        this.version = version;
        this.height = height;
        // byte[] → int[]（Jackson 默认把 byte[] 序列化成 base64 字符串，前端不便；转 int 数组直接 JSON 数组）
        this.semantic = new int[semantic.length];
        for (int i = 0; i < semantic.length; i++) {
            this.semantic[i] = semantic[i] & 0xFF;
        }
        this.objects = objects;
    }
}
