package com.petpark.dto;

import lombok.Data;

/**
 * 答疑响应：AI 的解答 + 缺失知识点
 */
@Data
public class ExplainResp {
    /** 错题记录 ID */
    private Long failureId;
    /** AI 答疑内容 */
    private String aiExplain;
    /** 缺失知识点（逗号分隔） */
    private String weakPoints;
}
