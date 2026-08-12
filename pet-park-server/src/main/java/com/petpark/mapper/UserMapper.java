package com.petpark.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.petpark.entity.User;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface UserMapper extends BaseMapper<User> {

    /**
     * 条件扣款（世界放置/养鱼，ADR-W4 原子化）：仅当 coins 足够时扣减。
     * 返回 affectedRows（1=成功，0=余额不足）；配合 @Transactional 防负币。
     */
    @Update("UPDATE users SET coins = coins - #{cost} WHERE id = #{uid} AND coins >= #{cost}")
    int updateCoinsIfEnough(@Param("uid") Long uid, @Param("cost") int cost);
}
