package com.petpark.dto;

import lombok.Data;

/**
 * 管理员编辑用户请求：只改传了的部分，password 留空不改
 */
@Data
public class AdminUpdateReq {
    /** 新用户名（可选） */
    private String username;
    /** 新昵称（可选） */
    private String nickname;
    /** 角色 user/admin（可选） */
    private String role;
    /** 积分（可选） */
    private Integer coins;
    /** 新密码（可选，留空/null 不修改） */
    private String password;
}
