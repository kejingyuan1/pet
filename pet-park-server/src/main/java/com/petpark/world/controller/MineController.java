package com.petpark.world.controller;

import com.petpark.common.Result;
import com.petpark.config.JwtAuthFilter;
import com.petpark.world.dto.ItemSellReq;
import com.petpark.world.dto.MiningProfile;
import com.petpark.world.dto.SellResult;
import com.petpark.world.service.WorldMiningService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 采矿 REST（M4）：档案查询 + 矿石售卖（服务端权威，ADR-W4 原子化）
 *
 *  - GET  /api/world/mining/profile  当前能量 / 等级 / 经验 / 背包
 *  - POST /api/world/mining/sell     售卖矿石换积分 {items: [{type, qty}]}
 *
 * uid 来自 JWT 拦截器注入的请求属性（与 WorldObjectController 同源）。
 */
@RestController
@RequestMapping("/api/world/mining")
public class MineController {

    private final WorldMiningService miningService;

    public MineController(WorldMiningService miningService) {
        this.miningService = miningService;
    }

    /** 采矿档案（能量/等级/经验/背包） */
    @GetMapping("/profile")
    public Result<MiningProfile> profile(@RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        return miningService.profile(uid);
    }

    /** 售卖矿石换积分（库存不足的项跳过，不中断整单） */
    @PostMapping("/sell")
    public Result<SellResult> sell(@RequestBody List<ItemSellReq> items,
                                   @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        return miningService.sell(uid, items);
    }
}
