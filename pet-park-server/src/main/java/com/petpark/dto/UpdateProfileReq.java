package com.petpark.dto;

import lombok.Data;

/**
 * 修改资料请求：改用户名 / 昵称
 * 两个字段都可选——传哪个改哪个，不传的不动
 */
@Data
public class UpdateProfileReq {
    /** 新用户名（可选，传了才改，需唯一） */
    private String username;
    /** 新昵称（可选，传了才改） */
    private String nickname;
}
