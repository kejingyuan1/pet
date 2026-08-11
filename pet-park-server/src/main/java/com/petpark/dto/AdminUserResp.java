package com.petpark.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 管理员用户列表项
 */
@Data
public class AdminUserResp {
    private Long userId;
    private String username;
    private String nickname;
    private String role;
    private Integer coins;
    private LocalDateTime createdAt;
}
