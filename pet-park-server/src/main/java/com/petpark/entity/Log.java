package com.petpark.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 事件日志表
 */
@Data
@TableName("logs")
public class Log {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String type;   // feed/play/harvest/watch/study/level...
    private String text;
    private LocalDateTime createdAt;
}
