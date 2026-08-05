package com.petpark.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.common.BizException;
import com.petpark.dto.LoginReq;
import com.petpark.dto.LoginResp;
import com.petpark.dto.RegisterReq;
import com.petpark.entity.User;
import com.petpark.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 用户注册/登录
 */
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;

    public LoginResp register(RegisterReq req) {
        // 用户名查重
        Long exist = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, req.getUsername()));
        if (exist != null && exist > 0) {
            throw new BizException("用户名已被占用");
        }
        User user = new User();
        user.setUsername(req.getUsername());
        user.setPassword(passwordEncoder.encode(req.getPassword()));
        user.setNickname(req.getNickname() == null || req.getNickname().isBlank()
                ? req.getUsername() : req.getNickname());
        user.setCreatedAt(LocalDateTime.now());
        userMapper.insert(user);

        return buildResp(user);
    }

    public LoginResp login(LoginReq req) {
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, req.getUsername()));
        if (user == null || !passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new BizException("用户名或密码错误");
        }
        return buildResp(user);
    }

    private LoginResp buildResp(User user) {
        LoginResp resp = new LoginResp();
        resp.setToken(tokenService.createToken(user.getId()));
        resp.setUserId(user.getId());
        resp.setUsername(user.getUsername());
        resp.setNickname(user.getNickname());
        return resp;
    }
}
