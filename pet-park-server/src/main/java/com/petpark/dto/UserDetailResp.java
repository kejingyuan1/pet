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
    /** 积分（users.coins 独立字段） */
    private Integer coins;
    /** 学历：PRIMARY_1..UNIVERSITY_4 */
    private String education;
    /** 角色：user 普通 / admin 管理员 */
    private String role;
    private LocalDateTime createdAt;
}
