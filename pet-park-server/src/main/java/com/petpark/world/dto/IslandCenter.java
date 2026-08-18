package com.petpark.world.dto;

import lombok.Data;

/**
 * 服务端权威岛屿中心（前端 HY3D 视觉层对齐用）。
 * cx / cz 为世界坐标（米），r 为岛屿基础半径（米）。
 */
@Data
public class IslandCenter {
    private double cx;
    private double cz;
    private double r;

    public IslandCenter(double cx, double cz, double r) {
        this.cx = cx;
        this.cz = cz;
        this.r = r;
    }
}
