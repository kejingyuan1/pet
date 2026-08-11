package com.petpark.controller;

import com.petpark.common.Result;
import com.petpark.dto.StateReq;
import com.petpark.entity.User;
import com.petpark.service.StateService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 玩家存档接口：GET 拉取 / PUT 保存（前端 save() 节流调用）
 * 存档直接读写 users.state_json（不再有独立 players 表）
 */
@RestController
@RequestMapping("/api/state")
@RequiredArgsConstructor
public class StateController {

    private final StateService stateService;

    /** 读取当前用户存档（无档返回 { version:0, stateJson:null }） */
    @GetMapping
    public Result<Map<String, Object>> get(@RequestAttribute("petpark.userId") Long userId) {
        User u = stateService.get(userId);
        Map<String, Object> data = new HashMap<>();
        if (u == null || u.getStateJson() == null) {
            data.put("version", 0);
            data.put("stateJson", null);
        } else {
            data.put("version", u.getVersion());
            data.put("stateJson", u.getStateJson());
            data.put("updatedAt", u.getUpdatedAt());
        }
        return Result.ok(data);
    }

    /** 保存/更新存档 */
    @PutMapping
    public Result<Void> save(@RequestAttribute("petpark.userId") Long userId,
                             @Valid @RequestBody StateReq req) {
        stateService.save(userId, req);
        return Result.ok();
    }
}
