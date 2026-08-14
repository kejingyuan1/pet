package com.petpark.world.dto;

import lombok.Data;

/**
 * REST 单元坐标请求：/api/world/remove、/upgrade、/harvest {gx, gz}
 */
@Data
public class CellReq {
    private Integer gx;
    private Integer gz;
}
