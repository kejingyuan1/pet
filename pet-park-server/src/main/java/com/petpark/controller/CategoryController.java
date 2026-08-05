package com.petpark.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.common.Result;
import com.petpark.entity.Category;
import com.petpark.mapper.CategoryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 统一类目接口（只读，开放访问）
 * 前端启动时拉取，替代内置常量表；支持按 type 过滤
 */
@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryMapper categoryMapper;

    /** 全部类目，或按 type 过滤（crop/fish/animal/furniture） */
    @GetMapping
    public Result<List<Category>> list(@RequestParam(required = false) String type) {
        LambdaQueryWrapper<Category> qw = new LambdaQueryWrapper<Category>()
                .eq(Category::getStatus, 1)
                .eq(type != null && !type.isBlank(), Category::getType, type)
                .orderByAsc(Category::getSortOrder);
        return Result.ok(categoryMapper.selectList(qw));
    }
}
