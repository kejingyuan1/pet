package com.petpark.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 玩家档案：一用户一档，state JSON 直存（前端结构无感，版本号控制兼容）
 */
@Data
@TableName(value = "players", autoResultMap = true)
public class Player {
    @TableId
    private Long userId;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Object stateJson;   // MySQL JSON 列 → 前端 state 对象

    private Integer version;    // 对应前端 LS_KEY 版本号

    private LocalDateTime updatedAt;
}
