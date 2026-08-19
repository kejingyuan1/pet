package com.petpark.ranch.service;

import com.petpark.ranch.entity.UserRanchAnimal;
import com.petpark.ranch.mapper.UserRanchAnimalMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 用户牧场拥有动物服务（权威落库 + 读）：
 *  - getOwnedCodes(uid)：返回已拥有动物 code 全集（异常→空列表）
 *  - buyAnimal(uid, code)：先查已拥有→若有返回 false；否则 INSERT IGNORE（防并发重复）；返回成功与否
 *
 * 牧场是独立于大世界的业务维度，单独置于 com.petpark.ranch 包（与 world 包解耦）。
 */
@Slf4j
@Service
public class UserRanchAnimalService {

    private final UserRanchAnimalMapper mapper;

    public UserRanchAnimalService(UserRanchAnimalMapper mapper) {
        this.mapper = mapper;
    }

    /** 返回当前用户已拥有动物 code 全集；异常→空列表（前端可降级用本地） */
    public List<String> getOwnedCodes(Long uid) {
        try {
            List<UserRanchAnimal> list = mapper.selectByUserId(uid);
            return list.stream().map(UserRanchAnimal::getAnimalCode).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[ranch] getOwnedCodes failed uid={}: {}", uid, e.getMessage());
            return List.of();
        }
    }

    /**
     * 购买动物（服务端权威）：
     *  - 已拥有 → 返回 false
     *  - 否则 INSERT IGNORE（并发重复购买时，另一个请求已插，本请求返回 0 → 仍判为已拥有）
     *  - 返回是否成功落库一行（金币扣除由前端预校验 + 后端落库，后端不重复校验金币）
     */
    public boolean buyAnimal(Long uid, String code) {
        if (code == null || code.isBlank()) return false;
        try {
            // 乐观预查：避免不必要的写；并发安全由 INSERT IGNORE 兜底
            List<UserRanchAnimal> existing = mapper.selectByUserId(uid);
            boolean already = existing.stream().anyMatch(a -> code.equals(a.getAnimalCode()));
            if (already) return false;
            int n = mapper.insertIgnoreDuplicate(uid, code);
            return n > 0;
        } catch (Exception e) {
            log.warn("[ranch] buyAnimal failed uid={} code={}: {}", uid, code, e.getMessage());
            return false;
        }
    }
}
