package com.petpark.ranch.config;

/**
 * 牧场业务错误码（1xxx 系，参考既有业务错误码风格）
 */
public final class RanchErrorCodeConstants {

    /** 已拥有该动物（重复购买） */
    public static final int RANCH_ALREADY_OWNED = 1_001_001;

    private RanchErrorCodeConstants() {}
}
