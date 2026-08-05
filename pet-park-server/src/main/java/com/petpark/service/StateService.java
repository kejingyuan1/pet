package com.petpark.service;

import com.petpark.dto.StateReq;
import com.petpark.entity.Player;
import com.petpark.mapper.PlayerMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 玩家存档读写（state JSON 直存，前端结构无感）
 */
@Service
@RequiredArgsConstructor
public class StateService {

    private final PlayerMapper playerMapper;

    /** 读取存档；无则返回 null（前端走 sampleState 初始化） */
    public Player get(Long userId) {
        return playerMapper.selectById(userId);
    }

    /** 保存/更新存档 */
    public void save(Long userId, StateReq req) {
        Player player = new Player();
        player.setUserId(userId);
        player.setStateJson(req.getStateJson());
        player.setVersion(req.getVersion() == null ? 7 : req.getVersion());
        player.setUpdatedAt(LocalDateTime.now());
        // upsert：存在则更新，不存在则插入
        if (playerMapper.selectById(userId) != null) {
            playerMapper.updateById(player);
        } else {
            playerMapper.insert(player);
        }
    }
}
