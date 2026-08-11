package com.petpark.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

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
    /** 角色：user 普通 / admin 管理员 */
    private String role;
    /** 积分（独立字段，权威数据源） */
    private Integer coins;
    /** 游戏存档 JSON（由 StateService 读写） */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Object stateJson;
    /** 存档版本号 */
    private Integer version;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
