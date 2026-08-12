package com.petpark.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 错题本记录（AI 答疑 + 查缺补漏）
 */
@Data
@TableName("question_failures")
public class QuestionFailure {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long questionId;
    /** 题目题干快照 */
    private String prompt;
    /** 用户答错的答案 */
    private String userAnswer;
    /** AI 答疑内容 */
    private String aiExplain;
    /** 缺失知识点（逗号分隔） */
    private String weakPoints;
    /** 0 待学习 / 1 已掌握 */
    private Integer status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
