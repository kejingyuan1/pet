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
}
