package com.petpark.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.common.Result;
import com.petpark.entity.Log;
import com.petpark.mapper.LogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 事件日志接口（可选：把 state.logs 抽成行，便于统计/排行）
 */
@RestController
@RequestMapping("/api/logs")
@RequiredArgsConstructor
public class LogController {

    private final LogMapper logMapper;

    /** 当前用户最近 N 条日志（默认 50） */
    @GetMapping
    public Result<List<Log>> list(@RequestAttribute("petpark.userId") Long userId,
                                  @RequestParam(defaultValue = "50") int limit) {
        LambdaQueryWrapper<Log> qw = new LambdaQueryWrapper<Log>()
                .eq(Log::getUserId, userId)
                .orderByDesc(Log::getId)
                .last("LIMIT " + Math.min(Math.max(limit, 1), 200));
        return Result.ok(logMapper.selectList(qw));
    }
}
