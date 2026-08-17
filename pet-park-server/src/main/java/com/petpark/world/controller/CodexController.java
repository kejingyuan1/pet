package com.petpark.world.controller;

import com.petpark.common.Result;
import com.petpark.config.JwtAuthFilter;
import com.petpark.world.service.WorldCodexService;
import com.petpark.world.service.WorldCultivationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 养成/图鉴 REST（P1 支柱③）
 *
 *  - GET /api/world/codex        图鉴：鱼 + 矿石，标已发现
 *  - GET /api/world/cultivation  养成汇总：等级/经验/能量/积分 + 收益曲线 + 解锁里程碑
 *
 * uid 来自 JWT 拦截器注入的请求属性（与 MineController 同源）。
 */
@RestController
@RequestMapping("/api/world")
public class CodexController {

    private final WorldCodexService codexService;
    private final WorldCultivationService cultivationService;

    public CodexController(WorldCodexService codexService, WorldCultivationService cultivationService) {
        this.codexService = codexService;
        this.cultivationService = cultivationService;
    }

    @GetMapping("/codex")
    public Result<Map<String, Object>> codex(@RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        return Result.ok(codexService.codex(uid));
    }

    @GetMapping("/cultivation")
    public Result<Map<String, Object>> cultivation(@RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        return Result.ok(cultivationService.summary(uid));
    }
}
