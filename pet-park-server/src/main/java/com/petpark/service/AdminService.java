package com.petpark.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.common.BizException;
import com.petpark.dto.AdminUpdateReq;
import com.petpark.dto.AdminUserResp;
import com.petpark.entity.User;
import com.petpark.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 管理员服务：用户管理（列表 / 编辑 / 删除），仅 admin 角色可调用
 */
@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    /** 校验调用者是否为管理员；不是则抛异常 */
    public void requireAdmin(Long userId) {
        User me = userMapper.selectById(userId);
        if (me == null || !"admin".equals(me.getRole())) {
            throw new BizException("无权限：仅管理员可操作");
        }
    }

    /** 用户列表（按注册时间倒序） */
    public List<AdminUserResp> listUsers() {
        List<User> users = userMapper.selectList(new LambdaQueryWrapper<User>()
                .orderByDesc(User::getId));
        List<AdminUserResp> list = new ArrayList<>();
        for (User u : users) {
            AdminUserResp r = new AdminUserResp();
            r.setUserId(u.getId());
            r.setUsername(u.getUsername());
            r.setNickname(u.getNickname());
            r.setRole(u.getRole() == null ? "user" : u.getRole());
            r.setCoins(u.getCoins() == null ? 0 : u.getCoins());
            r.setCreatedAt(u.getCreatedAt());
            list.add(r);
        }
        return list;
    }

    /** 编辑用户：用户名/昵称/角色/积分/密码（只改传了的） */
    public AdminUserResp updateUser(Long targetId, AdminUpdateReq req) {
        User user = userMapper.selectById(targetId);
        if (user == null) {
            throw new BizException("用户不存在");
        }
        boolean changed = false;
        // 改用户名（校验唯一）
        if (req.getUsername() != null && !req.getUsername().isBlank()
                && !req.getUsername().equals(user.getUsername())) {
            Long exist = userMapper.selectCount(new LambdaQueryWrapper<User>()
                    .eq(User::getUsername, req.getUsername())
                    .ne(User::getId, targetId));
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
        // 改角色（只允许 user/admin）
        if (req.getRole() != null && (req.getRole().equals("user") || req.getRole().equals("admin"))
                && !req.getRole().equals(user.getRole())) {
            user.setRole(req.getRole());
            changed = true;
        }
        // 改积分
        if (req.getCoins() != null && req.getCoins() >= 0 && !req.getCoins().equals(user.getCoins())) {
            user.setCoins(req.getCoins());
            changed = true;
        }
        // 改密码
        if (req.getPassword() != null && !req.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(req.getPassword()));
            changed = true;
        }
        if (changed) {
            userMapper.updateById(user);
        }
        AdminUserResp r = new AdminUserResp();
        r.setUserId(user.getId());
        r.setUsername(user.getUsername());
        r.setNickname(user.getNickname());
        r.setRole(user.getRole() == null ? "user" : user.getRole());
        r.setCoins(user.getCoins() == null ? 0 : user.getCoins());
        r.setCreatedAt(user.getCreatedAt());
        return r;
    }

    /** 删除用户（含存档一并删除） */
    public void deleteUser(Long targetId) {
        if (userMapper.selectById(targetId) == null) {
            throw new BizException("用户不存在");
        }
        userMapper.deleteById(targetId);
    }
}
