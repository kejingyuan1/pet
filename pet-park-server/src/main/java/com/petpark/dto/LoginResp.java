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
    /** 积分（users.coins） */
    private Integer coins;
    /** 角色：user 普通 / admin 管理员 */
    private String role;
    /** 学历：PRIMARY_1..UNIVERSITY_4（注册时填写，决定考试默认题库） */
    private String education;
    /** 性别：M 男 / F 女 */
    private String gender;
}
