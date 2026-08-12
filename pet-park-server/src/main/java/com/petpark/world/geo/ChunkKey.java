package com.petpark.world.geo;

/**
 * chunk 坐标编码工具：(cx, cz) ↔ "cx_cz" 字符串（DB chunk_key / WS 区域标识）
 */
public final class ChunkKey {

    private ChunkKey() {
    }

    /** 由 chunk 坐标生成 key，如 (12, 8) → "12_8" */
    public static String of(int cx, int cz) {
        return cx + "_" + cz;
    }

    /** 由世界格坐标反推所在 chunk key（gx 向下取整到 64 对齐） */
    public static String ofWorld(int gx, int gz) {
        return of(cxOf(gx), czOf(gz));
    }

    /** 世界格 X → chunk X（floor 除法，负数正确） */
    public static int cxOf(int gx) {
        return floorDiv(gx, 64);
    }

    /** 世界格 Z → chunk Z（floor 除法，负数正确） */
    public static int czOf(int gz) {
        return floorDiv(gz, 64);
    }

    /** 世界格 X → chunk 内局部列（0..63），直算消 %64 回绕 */
    public static int lxOf(int gx, int cx) {
        return gx - cx * 64;
    }

    /** 世界格 Z → chunk 内局部行（0..63），直算消 %64 回绕 */
    public static int lzOf(int gz, int cz) {
        return gz - cz * 64;
    }

    private static int floorDiv(int a, int b) {
        return (int) Math.floor((double) a / b);
    }
}
