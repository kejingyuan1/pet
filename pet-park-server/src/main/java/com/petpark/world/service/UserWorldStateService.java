package com.petpark.world.service;

import com.petpark.world.entity.UserWorldState;
import com.petpark.world.mapper.UserWorldStateMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 玩家世界位置持久化服务（P1）：
 *  - get(uid)：登录时恢复上次位置（WorldPhysicsService.addPlayer 优先采用）
 *  - save(uid, ...)：离开世界时保存（覆盖写，每用户一行）
 */
@Slf4j
@Service
public class UserWorldStateService {

    private final UserWorldStateMapper mapper;

    public UserWorldStateService(UserWorldStateMapper mapper) {
        this.mapper = mapper;
    }

    /** 取当前用户上次保存的世界位置；无记录返回 null */
    public UserWorldState get(long uid) {
        try {
            return mapper.selectByUid(uid);
        } catch (Exception e) {
            log.warn("[persist] get user_world_state failed uid={}: {}", uid, e.getMessage());
            return null;
        }
    }

    /** 保存（覆盖写）当前用户世界位置 */
    public void save(long uid, double gx, double gz, double y, int islandIdx, int variantIdx) {
        try {
            UserWorldState s = new UserWorldState();
            s.setUserId(uid);
            s.setGx(gx);
            s.setGz(gz);
            s.setY(y);
            s.setIslandIdx(islandIdx);
            s.setVariantIdx(variantIdx);
            mapper.upsert(s);
        } catch (Exception e) {
            log.warn("[persist] save user_world_state failed uid={}: {}", uid, e.getMessage());
        }
    }
}
