package com.petpark.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.common.BizException;
import com.petpark.dto.ExplainReq;
import com.petpark.dto.ExplainResp;
import com.petpark.dto.FailureResp;
import com.petpark.entity.Question;
import com.petpark.entity.QuestionFailure;
import com.petpark.mapper.QuestionFailureMapper;
import com.petpark.mapper.QuestionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 学习答疑服务：错题 → AI 答疑 → 记录缺失知识点 → 错题本
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StudyService {

    private final QuestionMapper questionMapper;
    private final QuestionFailureMapper failureMapper;
    private final AiService aiService;

    /**
     * 答题错误：调 AI 答疑 + 判定缺失知识点，记录到错题本
     */
    public ExplainResp explain(Long userId, ExplainReq req) {
        Question q = questionMapper.selectById(req.getQuestionId());
        if (q == null) {
            throw new BizException("题目不存在");
        }
        // 构造 AI 提示词
        String sys = "你是一位耐心的小学全科老师，擅长用通俗易懂的语言讲解知识点。"
                + "请针对错题给出：1) 正确解析（为什么是这个答案）；2) 用户做错的原因分析；3) 缺失的知识点（用「知识点：xxx」格式逐条列出，不超过3条）。"
                + "请用简体中文回答，面向小学生，语气亲切，控制在200字以内。"
                + "输出格式必须是 JSON：{\"explain\": \"解析内容\", \"weak_points\": [\"知识点1\", \"知识点2\"]}";
        String questionText = "【科目】" + q.getSubject() + "\n"
                + "【题目】" + q.getPrompt() + "\n"
                + "【选项/答案】" + (q.getOptions() != null ? q.getOptions().toString() : "-") + "\n"
                + "【正确答案】" + q.getAnswer() + "\n"
                + "【用户错误答案】" + (req.getUserAnswer() == null ? "-" : req.getUserAnswer()) + "\n"
                + "请解答并判定缺失知识点。";

        // 记录错题（先存，AI 结果异步回填）
        QuestionFailure f = new QuestionFailure();
        f.setUserId(userId);
        f.setQuestionId(q.getId());
        f.setPrompt(q.getPrompt());
        f.setUserAnswer(req.getUserAnswer());
        f.setStatus(0);
        failureMapper.insert(f);

        ExplainResp resp = new ExplainResp();
        resp.setFailureId(f.getId());

        // 调 AI
        String aiText = aiService.chat(sys, questionText);
        if (aiText == null || aiText.isBlank()) {
            resp.setAiExplain("AI 暂未配置或调用失败，可先查看正确答案： " + q.getAnswer());
            resp.setWeakPoints("");
            f.setAiExplain(resp.getAiExplain());
            failureMapper.updateById(f);
            return resp;
        }
        // 解析 JSON（AI 可能带 ``` 包裹或多余文字，做容错）
        String explain = aiText;
        String weak = "";
        try {
            String json = aiText;
            int s = json.indexOf('{');
            int e = json.lastIndexOf('}');
            if (s >= 0 && e > s) json = json.substring(s, e + 1);
            var root = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
            explain = root.path("explain").asText(explain);
            var wp = root.path("weak_points");
            if (wp.isArray()) {
                List<String> arr = new ArrayList<>();
                wp.forEach(n -> arr.add(n.asText()));
                weak = String.join("、", arr);
            }
        } catch (Exception ex) {
            log.warn("AI 返回解析失败，使用原文: {}", ex.getMessage());
        }
        resp.setAiExplain(explain);
        resp.setWeakPoints(weak);
        f.setAiExplain(explain);
        f.setWeakPoints(weak);
        failureMapper.updateById(f);
        return resp;
    }

    /** 错题列表（按时间倒序） */
    public List<FailureResp> listFailures(Long userId) {
        List<QuestionFailure> list = failureMapper.selectList(new LambdaQueryWrapper<QuestionFailure>()
                .eq(QuestionFailure::getUserId, userId)
                .orderByDesc(QuestionFailure::getCreatedAt));
        List<FailureResp> resp = new ArrayList<>();
        for (QuestionFailure f : list) {
            FailureResp r = new FailureResp();
            r.setFailureId(f.getId());
            r.setQuestionId(f.getQuestionId());
            r.setPrompt(f.getPrompt());
            r.setUserAnswer(f.getUserAnswer());
            r.setAiExplain(f.getAiExplain());
            r.setWeakPoints(f.getWeakPoints());
            r.setStatus(f.getStatus());
            r.setCreatedAt(f.getCreatedAt());
            Question q = questionMapper.selectById(f.getQuestionId());
            r.setCorrectAnswer(q != null ? q.getAnswer() : "-");
            resp.add(r);
        }
        return resp;
    }

    /** 标记已掌握 */
    public void markMastered(Long userId, Long failureId) {
        QuestionFailure f = requireOwn(userId, failureId);
        f.setStatus(1);
        failureMapper.updateById(f);
    }

    /** 删除错题 */
    public void delete(Long userId, Long failureId) {
        QuestionFailure f = requireOwn(userId, failureId);
        failureMapper.deleteById(f.getId());
    }

    private QuestionFailure requireOwn(Long userId, Long failureId) {
        QuestionFailure f = failureMapper.selectById(failureId);
        if (f == null || !f.getUserId().equals(userId)) {
            throw new BizException("记录不存在");
        }
        return f;
    }
}
