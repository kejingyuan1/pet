package com.petpark.world.geo;

/**
 * OpenSimplex2 二维噪声（double 精度，种子化，确定性）
 *
 * 说明（ADR-W3 确定性生成）：
 *  - 算法参考 Kurt Spencer 的 OpenSimplex 2D（2014，公有领域 Unlicense），
 *    属于 OpenSimplex 家族：偏斜单形网格 + 种子化梯度置换表。
 *  - 全程 double 运算，不做任何 float 中间量，保证同种子在任意 JVM / CPU 上输出一致；
 *    float 的最终 cast 由调用方（TerrainService.fbm）在写入 height[] 时一次性完成。
 *  - 置换表由 long 种子经 LCG 洗牌生成，同种子 ⇒ 同地形（确定性不变量）。
 *
 * 输出范围：约 [-1, 1]（NORM_CONSTANT_2D = 47 归一化）。
 */
public class OpenSimplex2 {

    /** 拉伸常数：(1/sqrt(2+1)-1)/2，OpenSimplex 2D 特有 */
    private static final double STRETCH_CONSTANT_2D = -0.211324865405187;
    /** 挤压常数：(sqrt(2+1)-1)/2 */
    private static final double SQUISH_CONSTANT_2D = 0.366025403784439;
    /** 2D 归一化常数 */
    private static final double NORM_CONSTANT_2D = 47;

    /** 2D 梯度：近似指向正八边形顶点的方向（8 组，每组 2 个分量） */
    private static final byte[] GRADIENTS_2D = {
             5,  2,    2,  5,   -5,  2,   -2,  5,
             5, -2,    2, -5,   -5, -2,   -2, -5,
            -5,  2,   -2,  5,    5, -2,    2, -5,
            -5, -2,   -2, -5,    5,  2,    2,  5,
    };

    private final short[] perm;

    /** 默认种子 0 */
    public OpenSimplex2() {
        this(0);
    }

    /** 以指定种子构造：LCG 洗牌 256 项置换表 */
    public OpenSimplex2(long seed) {
        perm = new short[256];
        short[] source = new short[256];
        for (short i = 0; i < 256; i++) {
            source[i] = i;
        }
        // 前滚 3 次，打散低种子相关性
        seed = seed * 6364136223846793005L + 1442695040888963407L;
        seed = seed * 6364136223846793005L + 1442695040888963407L;
        seed = seed * 6364136223846793005L + 1442695040888963407L;
        for (int i = 255; i >= 0; i--) {
            seed = seed * 6364136223846793005L + 1442695040888963407L;
            int r = (int) ((seed + 31) % (i + 1));
            if (r < 0) {
                r += (i + 1);
            }
            perm[i] = source[r];
            source[r] = source[i];
        }
    }

    /** 由字符串种子派生 long（世界配置 seed 为 VARCHAR，如 "dudu2019"） */
    public static long seedOf(String seedText) {
        if (seedText == null || seedText.isEmpty()) {
            return 0L;
        }
        long h = 1125899906842597L; // 大质数初值
        for (int i = 0; i < seedText.length(); i++) {
            h = 31 * h + seedText.charAt(i);
        }
        return h;
    }

    /**
     * 计算 (x, y) 处的 2D 噪声值，double 精度。
     *
     * @param x 世界格 X（建议整数格，配合 fbm 频率）
     * @param y 世界格 Z（注意：本类内部 y 参数即地形 Z 轴输入，不做坐标翻转）
     * @return 约 [-1, 1]
     */
    public double noise2(double x, double y) {
        // 输入坐标平移到网格上
        double stretchOffset = (x + y) * STRETCH_CONSTANT_2D;
        double xs = x + stretchOffset;
        double ys = y + stretchOffset;

        // 向下取整得到菱形（拉伸正方形）超单元原点
        int xsb = fastFloor(xs);
        int ysb = fastFloor(ys);

        // 计算挤压偏移
        double squishOffset = (xsb + ysb) * SQUISH_CONSTANT_2D;
        double xb = xsb + squishOffset;
        double yb = ysb + squishOffset;

        // 相对原点的网格坐标
        double xins = xs - xsb;
        double yins = ys - ysb;

        // 两者之和决定处于六边形的哪个区域
        double inSum = xins + yins;

        // 相对原点的位置
        double dx0 = x - xb;
        double dy0 = y - yb;

        double dxExt;
        double dyExt;
        int xsvExt;
        int ysvExt;

        double value = 0;

        // 贡献 (1,0)
        double dx1 = dx0 - 1 - SQUISH_CONSTANT_2D;
        double dy1 = dy0 - 0 - SQUISH_CONSTANT_2D;
        double attn1 = 2 - dx1 * dx1 - dy1 * dy1;
        if (attn1 > 0) {
            attn1 *= attn1;
            value += attn1 * attn1 * extrapolate(xsb + 1, ysb + 0, dx1, dy1);
        }

        // 贡献 (0,1)
        double dx2 = dx0 - 0 - SQUISH_CONSTANT_2D;
        double dy2 = dy0 - 1 - SQUISH_CONSTANT_2D;
        double attn2 = 2 - dx2 * dx2 - dy2 * dy2;
        if (attn2 > 0) {
            attn2 *= attn2;
            value += attn2 * attn2 * extrapolate(xsb + 0, ysb + 1, dx2, dy2);
        }

        if (inSum <= 1) {
            // 位于 (0,0) 处三角形（2-单纯形）内
            double zins = 1 - inSum;
            if (zins > xins || zins > yins) {
                // (0,0) 是最近的两个三角顶点之一
                if (xins > yins) {
                    xsvExt = xsb + 1;
                    ysvExt = ysb - 1;
                    dxExt = dx0 - 1 + 2 * SQUISH_CONSTANT_2D;
                    dyExt = dy0 + 2 * SQUISH_CONSTANT_2D;
                } else {
                    xsvExt = xsb - 1;
                    ysvExt = ysb + 1;
                    dxExt = dx0 + 2 * SQUISH_CONSTANT_2D;
                    dyExt = dy0 - 1 + 2 * SQUISH_CONSTANT_2D;
                }
            } else {
                // (1,0) 与 (0,1) 是最近的两个顶点
                xsvExt = xsb + 1;
                ysvExt = ysb + 1;
                dxExt = dx0 - 1 - 2 * SQUISH_CONSTANT_2D;
                dyExt = dy0 - 1 - 2 * SQUISH_CONSTANT_2D;
            }
        } else {
            // 位于 (1,1) 处三角形（2-单纯形）内
            double zins = 2 - inSum;
            if (zins < xins || zins < yins) {
                // (0,0) 是最近的两个三角顶点之一
                if (xins > yins) {
                    xsvExt = xsb + 2;
                    ysvExt = ysb + 0;
                    dxExt = dx0 - 2 - 2 * SQUISH_CONSTANT_2D;
                    dyExt = dy0 + 0 - 2 * SQUISH_CONSTANT_2D;
                } else {
                    xsvExt = xsb + 0;
                    ysvExt = ysb + 2;
                    dxExt = dx0 + 0 - 2 * SQUISH_CONSTANT_2D;
                    dyExt = dy0 - 2 - 2 * SQUISH_CONSTANT_2D;
                }
            } else {
                // (1,0) 与 (0,1) 是最近的两个顶点
                dxExt = dx0;
                dyExt = dy0;
                xsvExt = xsb;
                ysvExt = ysb;
            }
            xsb += 1;
            ysb += 1;
            dx0 = dx0 - 1 - 2 * SQUISH_CONSTANT_2D;
            dy0 = dy0 - 1 - 2 * SQUISH_CONSTANT_2D;
        }

        // 贡献 (0,0) 或 (1,1)
        double attn0 = 2 - dx0 * dx0 - dy0 * dy0;
        if (attn0 > 0) {
            attn0 *= attn0;
            value += attn0 * attn0 * extrapolate(xsb, ysb, dx0, dy0);
        }

        // 额外顶点贡献
        double attnExt = 2 - dxExt * dxExt - dyExt * dyExt;
        if (attnExt > 0) {
            attnExt *= attnExt;
            value += attnExt * attnExt * extrapolate(xsvExt, ysvExt, dxExt, dyExt);
        }

        return value / NORM_CONSTANT_2D;
    }

    /** 按置换表取 2D 梯度并做点积 */
    private double extrapolate(int xsb, int ysb, double dx, double dy) {
        int index = perm[(perm[xsb & 0xFF] + ysb) & 0xFF] & 0x0E;
        return GRADIENTS_2D[index] * dx + GRADIENTS_2D[index + 1] * dy;
    }

    /** 向下取整（double → int，含负数正确处理） */
    private static int fastFloor(double x) {
        int xi = (int) x;
        return x < xi ? xi - 1 : xi;
    }
}
