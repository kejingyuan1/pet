package com.petpark.world.geo;

/**
 * 单个 chunk 的语义网格封装：65×65 顶点高度 + 64×64 cell 语义
 *
 * 索引修正（设计稿 §5.1 / review-architecture 附录 A）：
 *   - 局部索引必须直算 lx = gx - cx*64、lz = gz - cz*64；
 *     严禁写回原 (gx%64)/(gz%64) —— 那会在 gx = cx*64+64（右边界）回绕到列 0，
 *     造成末列 cell 坡度计算错误 / 穿地接缝。
 *   - 高度数组含右/上边界点（65×65），相邻 chunk 共享边界行/列 → 渲染无缝；
 *     语义数组仅 64×64（cell 归属唯一，无重复）。
 */
public class SemanticGrid {

    public static final int CHUNK_SIZE = 64;
    public static final int HEIGHT_N = 65; // 65×65 顶点

    private final int cx;
    private final int cz;
    private final float[] height;   // HEIGHT_N × HEIGHT_N
    private final byte[] semantic;  // 64×64

    public SemanticGrid(int cx, int cz, float[] height, byte[] semantic) {
        if (height.length != HEIGHT_N * HEIGHT_N) {
            throw new IllegalArgumentException("height 数组长度必须为 65×65");
        }
        if (semantic.length != CHUNK_SIZE * CHUNK_SIZE) {
            throw new IllegalArgumentException("semantic 数组长度必须为 64×64");
        }
        this.cx = cx;
        this.cz = cz;
        this.height = height;
        this.semantic = semantic;
    }

    public int cx() {
        return cx;
    }

    public int cz() {
        return cz;
    }

    public float[] height() {
        return height;
    }

    public byte[] semantic() {
        return semantic;
    }

    /** 取 cell 语义：局部索引直算，调用方须保证 gx/gz 属于本 chunk */
    public CellType cellAt(int gx, int gz) {
        int lx = ChunkKey.lxOf(gx, cx);
        int lz = ChunkKey.lzOf(gz, cz);
        return CellType.of(semantic[lz * CHUNK_SIZE + lx]);
    }

    /** 取顶点高度：局部索引直算（0..64），调用方须保证 gx/gz 属于本 chunk（含边界） */
    public float heightAt(int gx, int gz) {
        int lx = ChunkKey.lxOf(gx, cx);
        int lz = ChunkKey.lzOf(gz, cz);
        return height[lz * HEIGHT_N + lx];
    }

    /** 世界格坐标是否在本 chunk 覆盖范围内（含右/上边界点） */
    public boolean contains(int gx, int gz) {
        int lx = ChunkKey.lxOf(gx, cx);
        int lz = ChunkKey.lzOf(gz, cz);
        return lx >= 0 && lx <= CHUNK_SIZE && lz >= 0 && lz <= CHUNK_SIZE;
    }
}
