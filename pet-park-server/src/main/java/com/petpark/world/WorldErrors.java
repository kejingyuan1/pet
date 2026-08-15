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

    // ===== P1 钓鱼错误码 =====

    public static final int WORLD_NOT_NEAR_WATER = 2019;

    /** 不在水边（钓鱼需临水） */
    public static BizException notNearWater() {
        return new BizException(WORLD_NOT_NEAR_WATER, "需要站在水边才能钓鱼");
    }

    public static final int WORLD_NOT_TREE = 2017;
    public static final int WORLD_INVALID_ANIMAL = 2018;

    /** 该格子不是树木（采集仅限 TREE 格） */
    public static BizException notTree() {
        return new BizException(WORLD_NOT_TREE, "这里没有可采集的树木");
    }

    /** 牧场动物代码非法（无法映射到背包产物） */
    public static BizException invalidAnimal() {
        return new BizException(WORLD_INVALID_ANIMAL, "未知的牧场动物，无法收取产物");
    }

    // ===== P0 拆除 / 升级 / 等级门槛（审计缺口 #3） =====

    public static final int WORLD_LEVEL_NOT_ENOUGH = 2012;
    public static final int WORLD_NOT_OWNER = 2013;
    public static final int WORLD_OBJECT_NOT_FOUND = 2014;
    public static final int WORLD_MAX_LEVEL = 2015;
    public static final int WORLD_FISH_NOT_READY = 2016;

    /** 等级不足（建筑/养鱼 level_req 门槛） */
    public static BizException levelNotEnough() {
        return new BizException(WORLD_LEVEL_NOT_ENOUGH, "等级不足，暂无法使用该功能");
    }

    /** 不是自己的对象（拆除/升级只能操作自己放置的） */
    public static BizException notOwner() {
        return new BizException(WORLD_NOT_OWNER, "只能操作自己放置的对象");
    }

    /** 该位置没有可操作的对象 */
    public static BizException objectNotFound() {
        return new BizException(WORLD_OBJECT_NOT_FOUND, "该位置没有可操作的对象");
    }

    /** 已达到最高等级（建筑升级上限） */
    public static BizException maxLevel() {
        return new BizException(WORLD_MAX_LEVEL, "已达到最高等级，无法继续升级");
    }

    /** 鱼塘尚未成熟（收获过早） */
    public static BizException fishNotReady() {
        return new BizException(WORLD_FISH_NOT_READY, "鱼塘尚未成熟，暂不能收获");
    }
}
