package com.petpark.dto;

import lombok.Data;

/**
 * 登录/注册响应：token + 用户信息
 */
@Data
public class LoginResp {
    private String token;
    private Long userId;
    private String username;
    private String nickname;
}
