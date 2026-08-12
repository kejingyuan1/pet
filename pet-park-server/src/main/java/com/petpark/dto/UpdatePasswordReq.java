package com.petpark.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 修改密码请求：验证旧密码后设置新密码
 */
@Data
public class UpdatePasswordReq {
    /** 旧密码（必须与库中一致才能改） */
    @NotBlank(message = "旧密码不能为空")
    private String oldPassword;

    /** 新密码（至少 6 位） */
    @NotBlank(message = "新密码不能为空")
    @Size(min = 6, max = 64, message = "新密码至少 6 位")
    private String newPassword;
}
