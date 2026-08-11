package com.petpark.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户详情（/api/auth/me 返回）
 */
@Data
public class UserDetailResp {
    private Long userId;
    private String username;
    private String nickname;
    private LocalDateTime createdAt;
}
