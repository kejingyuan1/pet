package com.petpark.ranch.controller;

import com.petpark.common.BizException;
import com.petpark.common.Result;
import com.petpark.config.JwtAuthFilter;
import com.petpark.ranch.config.RanchErrorCodeConstants;
import com.petpark.ranch.service.UserRanchAnimalService;
import lombok.Data;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

/**
 * 牧场拥有动物 REST（用户维度权威表 user_ranch_animals）：
 *  - GET  /api/ranch/animals  返回当前用户已拥有动物 code 全集
 *  - POST /api/ranch/buy      购买动物（服务端落库），返回成功与否 + 当前已拥有全集
 *
 * 与既有 world/controller/RanchController（/api/ranch/collect 收蛋）互补，共享 /api/ranch 前缀，
 * 子路径互不冲突。uid 一律从 JWT 解析（JwtAuthFilter 注入请求属性），不接受客户端传入（防越权）。
 * SecurityConfig 已对所有 /api/**（除白名单）要求认证，故本控制器端点均需携带 JWT。
 *
 * 显式指定 bean 名 ranchAnimalController，避免与既有 world/controller/RanchController（同名 bean 'ranchController'）冲突；
 * URL 路径（/api/ranch/animals、/api/ranch/buy）与之不冲突，仅 Spring bean 名需唯一。
 */
@RestController("ranchAnimalController")
@RequestMapping("/api/ranch")
public class RanchController {

    /** 服务端权威的有效动物代码（与前端 RANCH_ANIMALS 对齐；后端不信任客户端传值，必须白名单校验） */
    private static final Set<String> KNOWN_ANIMALS =
            Set.of("cat", "dog", "chicken", "duck", "cow", "sheep", "fish");

    private final UserRanchAnimalService service;

    public RanchController(UserRanchAnimalService service) {
        this.service = service;
    }

    /** GET /api/ranch/animals —— 当前用户已拥有的动物 code 全集（无记录返回空数组） */
    @GetMapping("/animals")
    public Result<List<String>> animals(@RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        return Result.ok(service.getOwnedCodes(uid));
    }

    /** POST /api/ranch/buy —— 购买动物；已拥有返回 1xxx 错误码 + 当前全集 */
    @PostMapping("/buy")
    public Result<RanchBuyResp> buy(@RequestBody RanchBuyReq req,
                                    @RequestAttribute(JwtAuthFilter.ATTR_USER_ID) Long uid) {
        if (req == null || req.getCode() == null || req.getCode().isBlank()) {
            throw new BizException("缺少动物代码 code");
        }
        String code = req.getCode();
        // 服务端白名单校验：拒绝任意非法 code（如 dragon），不信任客户端传值
        if (!KNOWN_ANIMALS.contains(code)) {
            throw new BizException("未知动物代码：" + code);
        }
        List<String> owned = service.getOwnedCodes(uid);
        if (owned.contains(code)) {
            RanchBuyResp r = new RanchBuyResp();
            r.setOk(false);
            r.setOwned(owned);
            return new Result<>(RanchErrorCodeConstants.RANCH_ALREADY_OWNED, "已拥有该动物", r);
        }
        boolean inserted = service.buyAnimal(uid, code);
        if (!inserted) {
            // 并发 INSERT IGNORE 未插入（另一请求刚买）：按已拥有处理，但带上最新全集供前端校正
            List<String> after = service.getOwnedCodes(uid);
            RanchBuyResp r = new RanchBuyResp();
            r.setOk(false);
            r.setOwned(after);
            return new Result<>(RanchErrorCodeConstants.RANCH_ALREADY_OWNED, "已拥有该动物", r);
        }
        List<String> after = service.getOwnedCodes(uid);
        RanchBuyResp r = new RanchBuyResp();
        r.setOk(true);
        r.setOwned(after);
        return Result.ok(r);
    }

    /** 购买请求体（uid 由 token 解析，不接受客户端 uid 防越权） */
    @Data
    public static class RanchBuyReq {
        private String code;
    }

    /** 购买响应体：是否成功 + 当前已拥有全集 */
    @Data
    public static class RanchBuyResp {
        private boolean ok;
        private List<String> owned;
    }
}
