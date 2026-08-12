package com.petpark.controller;

import com.petpark.common.Result;
import com.petpark.config.JwtAuthFilter;
import com.petpark.dto.ExplainReq;
import com.petpark.dto.ExplainResp;
import com.petpark.dto.FailureResp;
import com.petpark.service.StudyService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 学习答疑接口：错题答疑（AI）+ 错题本
 */
@RestController
@RequestMapping("/api/study")
@RequiredArgsConstructor
public class StudyController {

    private final StudyService studyService;

    private Long currentUserId(HttpServletRequest request) {
        return (Long) request.getAttribute(JwtAuthFilter.ATTR_USER_ID);
    }

    /** 答题错误：AI 答疑 + 判缺失知识点 + 记错题本 */
    @PostMapping("/explain")
    public Result<ExplainResp> explain(@RequestBody ExplainReq req, HttpServletRequest request) {
        return Result.ok(studyService.explain(currentUserId(request), req));
    }

    /** 错题列表 */
    @GetMapping("/failures")
    public Result<List<FailureResp>> listFailures(HttpServletRequest request) {
        return Result.ok(studyService.listFailures(currentUserId(request)));
    }

    /** 标记已掌握 */
    @PostMapping("/failures/{id}/mastered")
    public Result<Void> markMastered(@PathVariable Long id, HttpServletRequest request) {
        studyService.markMastered(currentUserId(request), id);
        return Result.ok();
    }

    /** 删除错题 */
    @DeleteMapping("/failures/{id}")
    public Result<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        studyService.delete(currentUserId(request), id);
        return Result.ok();
    }
}
