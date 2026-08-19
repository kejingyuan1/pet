package com.petpark.world.controller;

import com.petpark.common.Result;
import com.petpark.config.JwtAuthFilter;
import com.petpark.world.dto.UserWorldStateResp;
import com.petpark.world.entity.UserWorldState;
import com.petpark.world.service.TerrainService;
import com.petpark.world.service.UserWorldStateService;
import com.petpark.world.service.WorldPhysicsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 玩家世界位置 REST（P1 持久化）
 *  - GET  /api/world/position  返回当前用户上次保存位置（无记录 null）
 *  - POST /api/world/position  保存当前用户位置（服务端权威核验，防作弊）
 *
 * uid 一律从 JWT 解析（JwtAuthFilter 注入请求属性），不接受客户端传入的 uid（防越权）。
 */
@Slf4j
@RestController
@RequestMapping("/api/world/position")
public class PositionController {

    private final UserWorldStateService userWorldStateService;
    private final WorldPhysicsService worldPhysics;
    private final TerrainService terrain;

    public PositionController(UserWorldStateService userWorldStateService,
                              WorldPhysicsService worldPhysics,
                              TerrainService terrain) {
        this.userWorldStateService = userWorldStateService;
        this.worldPhysics = worldPhysics;
        this.terrain = terrain;
    }

    /** GET /api/world/position —— 当前用户上次世界位置（无记录返回 null） */
    @GetMapping
    public Result<UserWorldStateResp> lastPosition(
            @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        UserWorldState s = userWorldStateService.get(uid);
        if (s == null) {
            return Result.ok(null);
        }
        UserWorldStateResp resp = new UserWorldStateResp();
        resp.setUserId(s.getUserId());
        resp.setGx(s.getGx());
        resp.setGz(s.getGz());
        resp.setY(s.getY());
        resp.setIslandIdx(s.getIslandIdx());
        resp.setVariantIdx(s.getVariantIdx());
        resp.setUpdatedAt(s.getUpdatedAt());
        return Result.ok(resp);
    }

    /** POST /api/world/position —— 保存当前用户世界位置（服务端权威核验） */
    @PostMapping
    public Result<Void> savePosition(
            @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid,
            @RequestBody SavePositionReq req) {
        // 🔴 服务端权威核验：优先用 physics 实时坐标，避免客户端作弊 / 坐标系不同步
        double gx;
        double gz;
        double y;
        double[] auth = worldPhysics.getPlayerPos(uid);
        if (auth != null) {
            gx = auth[0];
            gz = auth[1];
            y = terrain.heightAt((int) Math.floor(gx), (int) Math.floor(gz)) + 0.7;
        } else {
            // 玩家尚未在物理世界（未 join / 已断线）：信任客户端上报并做基础校验（降级路径）
            if (req == null || req.gx == null || req.gz == null
                    || !terrain.inWorld((int) Math.floor(req.gx), (int) Math.floor(req.gz))) {
                return Result.fail("无效的世界坐标");
            }
            gx = req.gx;
            gz = req.gz;
            y = (req.y != null && !Double.isNaN(req.y))
                    ? req.y
                    : terrain.heightAt((int) Math.floor(gx), (int) Math.floor(gz)) + 0.7;
        }
        // islandIdx/variantIdx 仅视觉选岛，非安全敏感，采用客户端上报
        int islandIdx = (req != null && req.islandIdx != null) ? req.islandIdx : 0;
        int variantIdx = (req != null && req.variantIdx != null) ? req.variantIdx : 0;
        userWorldStateService.save(uid, gx, gz, y, islandIdx, variantIdx);
        log.info("[persist] savePosition uid={} ({},{},{}) island={} variant={}", uid, gx, gz, y, islandIdx, variantIdx);
        return Result.ok();
    }

    /** 保存请求体（uid 由 token 解析，不接受客户端 uid 防越权） */
    public static class SavePositionReq {
        public Double gx;
        public Double gz;
        public Double y;
        public Integer islandIdx;
        public Integer variantIdx;
    }
}
