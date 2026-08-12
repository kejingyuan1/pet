package com.petpark.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 状态保存请求：{ version, state_json }
 */
@Data
public class StateReq {
    /** 前端 LS_KEY 版本号（当前 7） */
    @NotNull(message = "版本号不能为空")
    private Integer version;

    /** 完整 state 对象（任意 JSON） */
    @NotNull(message = "state 不能为空")
    private Object stateJson;
}
