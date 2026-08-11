package com.petpark.controller;

import com.petpark.common.Result;
import com.petpark.config.JwtAuthFilter;
import com.petpark.dto.AdminUpdateReq;
import com.petpark.dto.AdminUserResp;
import com.petpark.service.AdminService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 管理员接口：用户管理（列表 / 编辑 / 删除）
 * 仅 role=admin 可访问（AdminService.requireAdmin 校验）
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;

    private Long currentUserId(HttpServletRequest request) {
        return (Long) request.getAttribute(JwtAuthFilter.ATTR_USER_ID);
    }

    /** 用户列表 */
    @GetMapping("/users")
    public Result<List<AdminUserResp>> listUsers(HttpServletRequest request) {
        Long me = currentUserId(request);
        adminService.requireAdmin(me);
        return Result.ok(adminService.listUsers());
    }

    /** 编辑用户：用户名/昵称/角色/积分/密码 */
    @PutMapping("/users/{id}")
    public Result<AdminUserResp> updateUser(@PathVariable Long id,
                                            @RequestBody AdminUpdateReq req,
                                            HttpServletRequest request) {
        Long me = currentUserId(request);
        adminService.requireAdmin(me);
        return Result.ok(adminService.updateUser(id, req));
    }

    /** 删除用户 */
    @DeleteMapping("/users/{id}")
    public Result<Void> deleteUser(@PathVariable Long id, HttpServletRequest request) {
        Long me = currentUserId(request);
        adminService.requireAdmin(me);
        adminService.deleteUser(id);
        return Result.ok();
    }
}
