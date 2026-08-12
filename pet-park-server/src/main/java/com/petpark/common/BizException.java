package com.petpark.common;

/**
 * 业务异常：抛出后由 GlobalExceptionHandler 转统一响应
 */
public class BizException extends RuntimeException {
    private final int code;

    public BizException(String message) {
        super(message);
        this.code = 1;
    }

    public BizException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}
