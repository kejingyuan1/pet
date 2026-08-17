package com.petpark.world.controller;

import com.petpark.common.Result;
import com.petpark.config.JwtAuthFilter;
import com.petpark.world.dto.RanchCollectReq;
import com.petpark.world.dto.RanchCollectResult;
import com.petpark.world.service.WorldMiningService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 牧场（宠物乐园）REST：收蛋/动物产物写入统一背包（world_inventory 持久化）
 */
@RestController
@RequestMapping("/api/ranch")
public class RanchController {

    private final WorldMiningService miningService;

    public RanchController(WorldMiningService miningService) {
        this.miningService = miningService;
    }

    /** POST /api/ranch/collect {animalCode} 收取动物产物存入背包 */
    @PostMapping("/collect")
    public Result<RanchCollectResult> collect(@RequestBody RanchCollectReq req,
                                              @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        if (req == null || req.getAnimalCode() == null || req.getAnimalCode().isBlank()) {
            throw new com.petpark.common.BizException("缺少动物代码 animalCode");
        }
        return miningService.collectProduct(uid, req.getAnimalCode());
    }
}
