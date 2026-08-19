package com.petpark.world.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.petpark.world.entity.UserWorldState;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 玩家世界位置 Mapper（P1 持久化）
 */
public interface UserWorldStateMapper extends BaseMapper<UserWorldState> {

    @Select("SELECT * FROM user_world_state WHERE user_id = #{uid} LIMIT 1")
    UserWorldState selectByUid(@Param("uid") long uid);

    @Insert("INSERT INTO user_world_state (user_id, gx, gz, y, island_idx, variant_idx) "
            + "VALUES (#{userId}, #{gx}, #{gz}, #{y}, #{islandIdx}, #{variantIdx}) "
            + "ON DUPLICATE KEY UPDATE gx=VALUES(gx), gz=VALUES(gz), y=VALUES(y), "
            + "island_idx=VALUES(island_idx), variant_idx=VALUES(variant_idx), updated_at=CURRENT_TIMESTAMP")
    int upsert(UserWorldState s);
}
