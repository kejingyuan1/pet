package com.petpark.world.controller;

import com.petpark.common.BizException;
import com.petpark.common.Result;
import com.petpark.config.JwtAuthFilter;
import com.petpark.world.dto.BuildReq;
import com.petpark.world.dto.CellReq;
import com.petpark.world.dto.FishReq;
import com.petpark.world.dto.HarvestResult;
import com.petpark.world.dto.WorldObjectResp;
import com.petpark.world.service.WorldObjectService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 世界对象 REST：放置建筑 / 湖中养鱼（服务端权威校验 + 原子写 + 广播）
 */
@RestController
@RequestMapping("/api/world")
public class WorldObjectController {

    private final WorldObjectService objectService;

    public WorldObjectController(WorldObjectService objectService) {
        this.objectService = objectService;
    }

    /** POST /api/world/build {gx, gz, objectType, rot?} */
    @PostMapping("/build")
    public Result<WorldObjectResp> build(@RequestBody BuildReq req,
                                         @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        requireCoords(req.getGx(), req.getGz());
        return objectService.placeBuild(uid, req.getGx(), req.getGz(), req.getObjectType(), req.getRot());
    }

    /** POST /api/world/fish {gx, gz, fishType} */
    @PostMapping("/fish")
    public Result<WorldObjectResp> fish(@RequestBody FishReq req,
                                        @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        requireCoords(req.getGx(), req.getGz());
        if (req.getFishType() == null || req.getFishType().isBlank()) {
            throw new BizException("缺少鱼种 fishType");
        }
        return objectService.stockFish(uid, req.getGx(), req.getGz(), req.getFishType());
    }

    /** POST /api/world/remove {gx, gz} 拆除自己放置的建筑/鱼塘 */
    @PostMapping("/remove")
    public Result<WorldObjectResp> remove(@RequestBody CellReq req,
                                          @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        requireCoords(req.getGx(), req.getGz());
        return objectService.removeObject(uid, req.getGx(), req.getGz());
    }

    /** POST /api/world/upgrade {gx, gz} 升级自己放置的建筑 */
    @PostMapping("/upgrade")
    public Result<WorldObjectResp> upgrade(@RequestBody CellReq req,
                                           @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        requireCoords(req.getGx(), req.getGz());
        return objectService.upgradeObject(uid, req.getGx(), req.getGz());
    }

    /** POST /api/world/harvest {gx, gz} 收获自己鱼塘（成熟则给奖励） */
    @PostMapping("/harvest")
    public Result<HarvestResult> harvest(@RequestBody CellReq req,
                                         @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        requireCoords(req.getGx(), req.getGz());
        return objectService.harvestFish(uid, req.getGx(), req.getGz());
    }

    private static void requireCoords(Integer gx, Integer gz) {
        if (gx == null || gz == null) {
            throw new BizException("缺少世界坐标 gx/gz");
        }
    }
}
