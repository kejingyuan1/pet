package com.petpark.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.common.BizException;
import com.petpark.dto.LoginReq;
import com.petpark.dto.LoginResp;
import com.petpark.dto.RegisterReq;
import com.petpark.dto.UpdatePasswordReq;
import com.petpark.dto.UpdateProfileReq;
import com.petpark.dto.UserDetailResp;
import com.petpark.entity.User;
import com.petpark.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 用户：注册 / 登录 / 资料管理（改用户名、昵称、密码）
 */
@Service
@RequiredArgsConstructor
public class UserService {

    /** 注册邀请码（application.yml: petpark.register.invite-code） */
    @Value("${petpark.register.invite-code}")
    private String inviteCode;

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;

    public LoginResp register(RegisterReq req) {
        // 邀请码校验（值在 application.yml: petpark.register.invite-code）
        if (!inviteCode.equals(req.getInviteCode())) {
            throw new BizException("邀请码不正确");
        }
        // 两次密码一致性（后端兜底校验，防绕过前端）
        if (!req.getPassword().equals(req.getConfirmPassword())) {
            throw new BizException("两次输入的密码不一致");
        }
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
        user.setRole("user");                   // 注册一律普通用户（管理员手动指定）
        user.setCoins(0);                       // 新用户积分独立：初始 0，不继承任何值
        user.setVersion(7);
        user.setEducation(req.getEducation() == null || req.getEducation().isBlank() ? "PRIMARY_1" : req.getEducation());
        user.setGender(req.getGender() == null || req.getGender().isBlank() ? "M" : req.getGender());
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
        resp.setRole(user.getRole() == null ? "user" : user.getRole());
        resp.setCoins(user.getCoins() == null ? 0 : user.getCoins());
        resp.setEducation(user.getEducation() == null ? "PRIMARY_1" : user.getEducation());
        resp.setGender(user.getGender() == null ? "M" : user.getGender());
        return resp;
    }

    /** 按 id 查用户详情；不存在抛异常 */
    public UserDetailResp getUserDetail(Long userId) {
        User user = requireUser(userId);
        UserDetailResp resp = new UserDetailResp();
        resp.setUserId(user.getId());
        resp.setUsername(user.getUsername());
        resp.setNickname(user.getNickname());
        resp.setRole(user.getRole() == null ? "user" : user.getRole());
        resp.setCoins(user.getCoins() == null ? 0 : user.getCoins());
        resp.setEducation(user.getEducation() == null ? "PRIMARY_1" : user.getEducation());
        resp.setGender(user.getGender() == null ? "M" : user.getGender());
        resp.setCreatedAt(user.getCreatedAt());
        return resp;
    }

    /** 修改资料：用户名 / 昵称（只改传了的部分） */
    public UserDetailResp updateProfile(Long userId, UpdateProfileReq req) {
        User user = requireUser(userId);
        boolean changed = false;

        // 改用户名（校验唯一）
        if (req.getUsername() != null && !req.getUsername().isBlank()
                && !req.getUsername().equals(user.getUsername())) {
            Long exist = userMapper.selectCount(new LambdaQueryWrapper<User>()
                    .eq(User::getUsername, req.getUsername())
                    .ne(User::getId, userId));
            if (exist != null && exist > 0) {
                throw new BizException("用户名已被占用");
            }
            user.setUsername(req.getUsername());
            changed = true;
        }
        // 改昵称
        if (req.getNickname() != null && !req.getNickname().isBlank()
                && !req.getNickname().equals(user.getNickname())) {
            user.setNickname(req.getNickname());
            changed = true;
        }
        // 改学历
        if (req.getEducation() != null && !req.getEducation().isBlank()
                && !req.getEducation().equals(user.getEducation())) {
            user.setEducation(req.getEducation());
            changed = true;
        }
        if (changed) {
            userMapper.updateById(user);
        }
        return getUserDetail(userId);
    }

    /** 修改密码：校验旧密码 → 设置新密码 */
    public void updatePassword(Long userId, UpdatePasswordReq req) {
        User user = requireUser(userId);
        if (!passwordEncoder.matches(req.getOldPassword(), user.getPassword())) {
            throw new BizException("旧密码不正确");
        }
        user.setPassword(passwordEncoder.encode(req.getNewPassword()));
        userMapper.updateById(user);
    }

    /** 按 id 取用户，不存在抛异常 */
    private User requireUser(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BizException("用户不存在");
        }
        return user;
    }
}
