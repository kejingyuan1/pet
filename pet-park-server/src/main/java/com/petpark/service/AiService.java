package com.petpark.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 答疑服务：调用 DashScope（阿里云百炼）通义千问 OpenAI 兼容接口
 * 配置：application.yml petpark.ai.api-key（或环境变量 DASHSCOPE_API_KEY）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${petpark.ai.api-key:}")
    private String apiKey;

    @Value("${petpark.ai.model:deepseek-v4-flash}")
    private String model;

    @Value("${petpark.ai.base-url:https://dashscope.aliyuncs.com/compatible-mode/v1}")
    private String baseUrl;

    @Value("${petpark.ai.json-mode:true}")
    private boolean jsonMode;

    /** 是否已配置 API Key */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * 调用通义千问对话，返回纯文本回复
     */
    public String chat(String systemPrompt, String userContent) {
        if (!isConfigured()) {
            log.warn("AI 未配置 API Key，跳过答疑");
            return null;
        }
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("model", model);
            List<Map<String, String>> messages = new ArrayList<>();
            messages.add(Map.of("role", "system", "content", systemPrompt));
            messages.add(Map.of("role", "user", "content", userContent));
            body.put("messages", messages);
            // 仅当网关支持 JSON 模式才传 response_format（部分网关忽略/报错可关）
            if (jsonMode) {
                Map<String, Object> respFormat = new HashMap<>();
                respFormat.put("type", "json_object");
                body.put("response_format", respFormat);
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

            ResponseEntity<String> resp = restTemplate.exchange(
                    baseUrl + "/chat/completions", HttpMethod.POST, entity, String.class);
            JsonNode root = objectMapper.readTree(resp.getBody());
            return root.path("choices").path(0).path("message").path("content").asText(null);
        } catch (Exception e) {
            log.error("调用 AI 失败: {}", e.getMessage());
            return null;
        }
    }
}
