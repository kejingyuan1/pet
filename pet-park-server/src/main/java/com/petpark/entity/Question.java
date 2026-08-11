package com.petpark.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 学习题库表（兼容多科目 + 多题型）
 * subject：english 英语 | hanzi 汉字 | chengyu 成语 | math 数学 | thinking 思维
 * q_type：choice 单选 | match 配对 | fill 填空 | qa 问答
 */
@Data
@TableName(value = "questions", autoResultMap = true)
public class Question {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String subject;
    /** 学历：PRIMARY_1..PRIMARY_6 / JUNIOR_1..JUNIOR_3 / SENIOR_1..SENIOR_3 / UNIVERSITY_1..UNIVERSITY_4 */
    private String education;
    /** 题型：序列化强制为 qType（前端依赖），避免 Jackson 驼峰降为 qtype */
    @JsonProperty("qType")
    private String qType;
    private String groupId;
    private String groupName;
    private String prompt;   // 题干（支持 JSON）

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Object options;  // 选择题选项 [{text, correct, icon}]

    private String answer;   // 正确答案
    private Integer level;
    private Integer points;
    private Integer status;
    private LocalDateTime createdAt;
}
