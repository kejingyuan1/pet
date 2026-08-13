package com.petpark.world;

import com.petpark.common.BizException;

/**
 * 大世界错误码（与设计 01 §8.3 对齐；M4 采矿错误码后续追加）
 */
public final class WorldErrors {

    private WorldErrors() {
    }

    public static final int WORLD_OUT_OF_BOUNDS = 2001;
    public static final int WORLD_NOT_BUILDABLE = 2002;
    public static final int WORLD_CELL_OCCUPIED = 2003;
    public static final int WORLD_NOT_WATER = 2004;
    public static final int BAD_OBJECT_TYPE = 2005;
    public static final int INSUFFICIENT_COINS = 2006;

    public static BizException outOfBounds() {
        return new BizException(WORLD_OUT_OF_BOUNDS, "超出世界边界");
    }

    public static BizException notBuildable() {
        return new BizException(WORLD_NOT_BUILDABLE, "该格子不可建造（需草地/沙地且坡度平缓）");
    }

    public static BizException cellOccupied() {
        return new BizException(WORLD_CELL_OCCUPIED, "该格子已被占用");
    }

    public static BizException notWater() {
        return new BizException(WORLD_NOT_WATER, "只能在湖水里养鱼");
    }

    public static BizException badObjectType() {
        return new BizException(BAD_OBJECT_TYPE, "对象类型不存在或未启用");
    }

    public static BizException insufficientCoins() {
        return new BizException(INSUFFICIENT_COINS, "金币不足");
    }

    // ===== M4 采矿错误码 =====

    public static final int WORLD_NOT_ORE = 2007;
    public static final int WORLD_ORE_DEPLETED = 2008;
    public static final int WORLD_INSUFFICIENT_ENERGY = 2009;
    public static final int WORLD_TOO_FAR = 2010;
    public static final int WORLD_NOT_IN_WORLD = 2011;

    public static BizException notOre() {
        return new BizException(WORLD_NOT_ORE, "该格子不是矿脉");
    }

    public static BizException oreDepleted() {
        return new BizException(WORLD_ORE_DEPLETED, "矿脉已被采空");
    }

    public static BizException insufficientEnergy() {
        return new BizException(WORLD_INSUFFICIENT_ENERGY, "能量不足，无法采矿");
    }

    public static BizException tooFar() {
        return new BizException(WORLD_TOO_FAR, "距离矿脉太远，请靠近后再采");
    }

    public static BizException notInWorld() {
        return new BizException(WORLD_NOT_IN_WORLD, "尚未进入世界，无法采矿");
    }
}
