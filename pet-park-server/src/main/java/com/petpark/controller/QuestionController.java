package com.petpark.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.common.Result;
import com.petpark.entity.Question;
import com.petpark.mapper.QuestionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 学习题库接口（只读，开放访问）
 * 支持按科目 subject（english/hanzi/chengyu/math/thinking）过滤
 */
@RestController
@RequestMapping("/api/questions")
@RequiredArgsConstructor
public class QuestionController {

    private final QuestionMapper questionMapper;

    /** 题库列表：?subject=math 可选 */
    @GetMapping
    public Result<List<Question>> list(@RequestParam(required = false) String subject) {
        LambdaQueryWrapper<Question> qw = new LambdaQueryWrapper<Question>()
                .eq(Question::getStatus, 1)
                .eq(subject != null && !subject.isBlank(), Question::getSubject, subject)
                .orderByAsc(Question::getLevel);
        return Result.ok(questionMapper.selectList(qw));
    }
}
