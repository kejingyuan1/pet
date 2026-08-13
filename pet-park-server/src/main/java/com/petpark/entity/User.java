package com.petpark.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 用户表（账号 + 积分 + 游戏存档，一用户一行）
 * coins：积分独立字段（可查询/统计）
 * stateJson：游戏存档 JSON（菜地/宠物等动态状态）
 */
@Data
@TableName(value = "users", autoResultMap = true)
public class User {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String username;
    private String password;   // BCrypt 哈希
    private String nickname;
    /** 学历：PRIMARY_1..PRIMARY_6 / JUNIOR_1..JUNIOR_3 / SENIOR_1..SENIOR_3 / UNIVERSITY_1..UNIVERSITY_4 */
    private String education;
    /** 角色：user 普通 / admin 管理员 */
    private String role;
    /** 积分（独立字段，权威数据源） */
    private Integer coins;
    /** 游戏存档 JSON（由 StateService 读写） */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Object stateJson;
    /** 存档版本号 */
    private Integer version;
    /** 采矿能量当前值（与 categories.energy 动物饲料能量互不相干） */
    private Integer energy;
    /** 世界等级（由累积经验推导：1 + floor(exp/100)） */
    private Integer level;
    /** 世界经验（累积） */
    private Long experience;
    /** 玩家当前位置 X（世界格） */
    private Integer posX;
    /** 玩家当前位置 Z（世界格） */
    private Integer posZ;
    /** 玩家当前高度 Y */
    private BigDecimal posY;
    /** 玩家所在 chunk_key（区域订阅） */
    private String lastChunk;
    /** 能量最后再生时间戳（懒再生基准） */
    private LocalDateTime energyUpdatedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
