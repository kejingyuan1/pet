package com.petpark.controller;

import com.petpark.common.Result;
import com.petpark.config.JwtAuthFilter;
import com.petpark.dto.LoginReq;
import com.petpark.dto.LoginResp;
import com.petpark.dto.RegisterReq;
import com.petpark.dto.UpdatePasswordReq;
import com.petpark.dto.UpdateProfileReq;
import com.petpark.dto.UserDetailResp;
import com.petpark.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 认证接口：注册 / 登录 / 用户资料管理（改用户名、昵称、密码）
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserService userService;

    /** 注册 */
    @PostMapping("/register")
    public Result<LoginResp> register(@Valid @RequestBody RegisterReq req) {
        return Result.ok(userService.register(req));
    }

    /** 登录 */
    @PostMapping("/login")
    public Result<LoginResp> login(@Valid @RequestBody LoginReq req) {
        return Result.ok(userService.login(req));
    }

    /** 获取当前登录用户信息 */
    @GetMapping("/me")
    public Result<UserDetailResp> me(HttpServletRequest request) {
        Long userId = (Long) request.getAttribute(JwtAuthFilter.ATTR_USER_ID);
        return Result.ok(userService.getUserDetail(userId));
    }

    /** 修改资料：用户名 / 昵称（传哪个改哪个） */
    @PutMapping("/profile")
    public Result<UserDetailResp> updateProfile(@Valid @RequestBody UpdateProfileReq req,
                                                HttpServletRequest request) {
        Long userId = (Long) request.getAttribute(JwtAuthFilter.ATTR_USER_ID);
        return Result.ok(userService.updateProfile(userId, req));
    }

    /** 修改密码：校验旧密码后设置新密码 */
    @PutMapping("/password")
    public Result<Void> updatePassword(@Valid @RequestBody UpdatePasswordReq req,
                                       HttpServletRequest request) {
        Long userId = (Long) request.getAttribute(JwtAuthFilter.ATTR_USER_ID);
        userService.updatePassword(userId, req);
        return Result.ok(null);
    }
}
