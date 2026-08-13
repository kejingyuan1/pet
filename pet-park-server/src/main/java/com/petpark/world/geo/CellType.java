package com.petpark.world.geo;

/**
 * 世界格语义类型（与设计文档 01 §4.2 一致）
 *
 * 编码约定：byte 码写入 chunk 响应（64×64），客户端按码着色/判定。
 * 注意：empty（矿挖空后的过渡语义）不参与生成，仅由 terrain_mods 叠加（M4），此处仅声明。
 */
public enum CellType {

    WATER((byte) 0, "water"),
    SAND((byte) 1, "sand"),
    GRASS((byte) 2, "grass"),
    MOUNTAIN((byte) 3, "mountain"),
    TREE((byte) 4, "tree"),
    ROCK((byte) 5, "rock"),
    ORE_COAL((byte) 6, "ore_coal"),
    ORE_IRON((byte) 7, "ore_iron"),
    ORE_GOLD((byte) 8, "ore_gold"),
    EMPTY((byte) 9, "empty"),
    RIVER((byte) 10, "river");

    private final byte code;
    private final String name;

    CellType(byte code, String name) {
        this.code = code;
        this.name = name;
    }

    public byte code() {
        return code;
    }

    public String typeName() {
        return name;
    }

    /** 是否矿脉（可采矿，M4 用） */
    public boolean isOre() {
        return this == ORE_COAL || this == ORE_IRON || this == ORE_GOLD;
    }

    /** 是否可站立/建造（walkable：sand/grass/river，mountain 需看坡度） */
    public boolean isWalkable() {
        return this == SAND || this == GRASS || this == RIVER;
    }

    /** 是否为树/岩石等不可建造装饰 */
    public boolean isObstacle() {
        return this == TREE || this == ROCK;
    }

    /** 由 byte 码还原枚举；未知码默认 GRASS（防御性） */
    public static CellType of(byte code) {
        for (CellType t : values()) {
            if (t.code == code) {
                return t;
            }
        }
        return GRASS;
    }

    /** 由字符串名还原（DB / 协议用），未知返回 GRASS */
    public static CellType ofName(String name) {
        if (name == null) {
            return GRASS;
        }
        for (CellType t : values()) {
            if (t.name.equalsIgnoreCase(name)) {
                return t;
            }
        }
        return GRASS;
    }
}
