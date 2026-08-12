package com.petpark.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 错题本列表项
 */
@Data
public class FailureResp {
    private Long failureId;
    private Long questionId;
    /** 题目题干快照 */
    private String prompt;
    /** 正确答案（questions.answer） */
    private String correctAnswer;
    /** 用户答错的答案 */
    private String userAnswer;
    /** AI 答疑内容 */
    private String aiExplain;
    /** 缺失知识点 */
    private String weakPoints;
    /** 0 待学习 / 1 已掌握 */
    private Integer status;
    private LocalDateTime createdAt;
}
