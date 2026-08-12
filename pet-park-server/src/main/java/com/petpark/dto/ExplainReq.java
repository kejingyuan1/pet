package com.petpark.dto;

import lombok.Data;

/**
 * 答疑请求：答错题目时前端提交
 */
@Data
public class ExplainReq {
    /** 题目 ID（questions.id） */
    private Long questionId;
    /** 用户答错的答案 */
    private String userAnswer;
}
