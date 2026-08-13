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

    /**
     * 采矿能量懒再生（M4）：按 (now - energy_updated_at) 补能量（每 regenMs 回 1 点，上限 max）。
     * 同时刷新 energy_updated_at = now（避免重复累计）；首次/空值以 NOW() 兜底（不补但落时间戳）。
     */
    @Update("UPDATE users SET energy = LEAST(#{max}, COALESCE(energy,0) + " +
            "FLOOR((#{now} - UNIX_TIMESTAMP(COALESCE(energy_updated_at, NOW())) * 1000) / #{regenMs})), " +
            "energy_updated_at = FROM_UNIXTIME(#{now}/1000) " +
            "WHERE id = #{uid}")
    int regenEnergy(@Param("uid") Long uid, @Param("now") long now, @Param("max") int max, @Param("regenMs") long regenMs);

    /** 采矿耗能：仅当能量足够时扣减，返回 affectedRows（1=成功，0=不足）；配合 @Transactional 防超额 */
    @Update("UPDATE users SET energy = energy - #{cost} WHERE id = #{uid} AND energy >= #{cost}")
    int spendEnergy(@Param("uid") Long uid, @Param("cost") int cost);

    /** 累积经验并同步 level = 1 + floor(exp/100)（保证 mine/profile 读到的 level 一致） */
    @Update("UPDATE users SET experience = COALESCE(experience,0) + #{exp}, " +
            "level = 1 + FLOOR((COALESCE(experience,0) + #{exp}) / 100) " +
            "WHERE id = #{uid}")
    int addExperience(@Param("uid") Long uid, @Param("exp") int exp);

    /** 售卖矿石获得金币（原子累加） */
    @Update("UPDATE users SET coins = COALESCE(coins,0) + #{earned} WHERE id = #{uid}")
    int addCoins(@Param("uid") Long uid, @Param("earned") int earned);
}
