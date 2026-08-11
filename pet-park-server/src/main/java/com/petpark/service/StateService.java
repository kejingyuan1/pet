package com.petpark.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.petpark.dto.StateReq;
import com.petpark.entity.User;
import com.petpark.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 玩家存档读写（直接读写 users.state_json，不再有独立 players 表）
 * 一用户一行：state JSON 直存，前端结构无感
 */
@Service
@RequiredArgsConstructor
public class StateService {

    private final UserMapper userMapper;

    /** 读取存档；无存档返回 null（前端初始化空档后保存） */
    public User get(Long userId) {
        return userMapper.selectById(userId);
    }

    /** 保存/更新存档：直接更新 users 表的 state_json + 积分（用户注册时已存在，只更新） */
    public void save(Long userId, StateReq req) {
        User user = new User();
        user.setId(userId);
        user.setStateJson(req.getStateJson());
        user.setVersion(req.getVersion() == null ? 7 : req.getVersion());
        user.setUpdatedAt(LocalDateTime.now());
        // 同步积分：stateJson.coins 提取到 users.coins（独立字段，可统计）
        Integer coins = parseCoins(req.getStateJson());
        if (coins != null) {
            user.setCoins(coins);
        }
        userMapper.updateById(user);
    }

    /** 从 state JSON 提取 coins；解析失败返回 null（不覆盖） */
    private Integer parseCoins(Object stateJson) {
        if (stateJson == null) return null;
        try {
            if (stateJson instanceof java.util.Map<?, ?>) {
                Object c = ((java.util.Map<?, ?>) stateJson).get("coins");
                return c == null ? null : Integer.parseInt(String.valueOf(c));
            }
        } catch (Exception e) {
            // 解析失败忽略，保持原值
        }
        return null;
    }

    /** 仅供其它模块按用户同步积分（如管理员改分） */
    public void updateCoins(Long userId, int coins) {
        userMapper.update(null, new LambdaUpdateWrapper<User>()
                .eq(User::getId, userId)
                .set(User::getCoins, coins));
    }
}