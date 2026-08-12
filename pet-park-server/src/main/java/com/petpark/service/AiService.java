package com.petpark.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 答疑服务：调用阿里云百炼（DashScope）通义千问 OpenAI 兼容接口
 * 配置：application.yml petpark.ai.api-key（或环境变量 DASHSCOPE_API_KEY）
 *       petpark.ai.models（多模型 fallback 链，按顺序逐个尝试，前一个用完自动降级下一个）
 * 说明：纯百炼体系，不再支持 CodeBuddy/DeepSeek 官方等其他网关
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${petpark.ai.api-key:}")
    private String apiKey;

    /** 多模型 fallback 链：逗号分隔，按顺序逐个尝试，前一个额度耗尽/失败自动降级下一个 */
    @Value("${petpark.ai.models:qwen3.7-plus,qwen3.5-plus,qwen3.6-flash}")
    private List<String> models;

    @Value("${petpark.ai.base-url:https://dashscope.aliyuncs.com/compatible-mode/v1}")
    private String baseUrl;

    @Value("${petpark.ai.json-mode:true}")
    private boolean jsonMode;

    /** 是否已配置 API Key */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * 调用百炼多模型链：依次尝试 models 中的每个模型，前一个失败（429/403/500 等）自动降级下一个
     * @return 成功：AI 文本回复；全部失败：null
     */
    public String chat(String systemPrompt, String userContent) {
        if (!isConfigured()) {
            log.warn("AI 未配置 API Key，跳过答疑");
            return null;
        }
        if (models == null || models.isEmpty()) {
            log.warn("AI 未配置 models 列表");
            return null;
        }
        // 依次尝试每个模型
        Exception lastErr = null;
        for (String m : models) {
            try {
                String text = callOne(m, systemPrompt, userContent);
                if (text != null) {
                    if (!models.get(0).equals(m)) {
                        log.info("主模型 {} 不可用，已降级到备用模型 {}", models.get(0), m);
                    }
                    return text;
                }
            } catch (Exception e) {
                lastErr = e;
                log.warn("AI 模型 {} 调用失败，将降级到下一个: {}", m, e.getMessage());
            }
        }
        log.error("AI 所有模型均调用失败（链长={}），最后错误: {}", models.size(),
                lastErr == null ? "n/a" : lastErr.getMessage());
        return null;
    }

    /** 单模型调用：失败（非 2xx / 抛异常）返回 null 表示应降级 */
    private String callOne(String model, String systemPrompt, String userContent) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        messages.add(Map.of("role", "user", "content", userContent));
        body.put("messages", messages);
        if (jsonMode) {
            Map<String, Object> respFormat = new HashMap<>();
            respFormat.put("type", "json_object");
            body.put("response_format", respFormat);
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);  // 百炼 OpenAI 兼容模式统一 Bearer
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<String> resp = restTemplate.exchange(
                    baseUrl + "/chat/completions", HttpMethod.POST, entity, String.class);
            if (!resp.getStatusCode().is2xxSuccessful()) {
                log.warn("AI 模型 {} 返回非 2xx: {}", model, resp.getStatusCode());
                return null;
            }
            JsonNode root = objectMapper.readTree(resp.getBody());
            String content = root.path("choices").path(0).path("message").path("content").asText(null);
            if (content == null || content.isBlank()) {
                log.warn("AI 模型 {} 返回 content 为空", model);
                return null;
            }
            return content;
        } catch (HttpStatusCodeException e) {
            // 4xx/5xx：额度耗尽（429）、模型不存在、参数错等都降级
            log.warn("AI 模型 {} HTTP {}: {}", model, e.getStatusCode(),
                    e.getResponseBodyAsString() == null ? "" : e.getResponseBodyAsString().substring(0, Math.min(200, e.getResponseBodyAsString().length())));
            return null;
        }
    }
}