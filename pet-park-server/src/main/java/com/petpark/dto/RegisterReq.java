package com.petpark.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 注册请求：用户名 + 昵称 + 密码（两次）+ 邀请码
 */
@Data
public class RegisterReq {
    @NotBlank(message = "用户名不能为空")
    @Size(min = 2, max = 16, message = "用户名长度 2-16")
    @Pattern(regexp = "^[a-zA-Z0-9_\\u4e00-\\u9fa5]+$", message = "用户名只能包含中文、字母、数字、下划线")
    private String username;

    /** 昵称（必填） */
    @NotBlank(message = "昵称不能为空")
    @Size(max = 20, message = "昵称最长 20 字")
    private String nickname;

    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 32, message = "密码长度 6-32")
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).{6,}$", message = "密码必须同时包含数字和字母")
    private String password;

    /** 确认密码（后端也校验一次一致性，防止绕过前端） */
    @NotBlank(message = "请再次输入密码")
    private String confirmPassword;

    /** 邀请码（配置在 application.yml，petpark.register.invite-code） */
    @NotBlank(message = "邀请码不能为空")
    private String inviteCode;

    /** 学历（PRIMARY_1..UNIVERSITY_4） */
    @NotBlank(message = "请选择学历")
    @Pattern(regexp = "^(PRIMARY_[1-6]|JUNIOR_[1-3]|SENIOR_[1-3]|UNIVERSITY_[1-4])$",
             message = "学历取值非法")
    private String education;
}
