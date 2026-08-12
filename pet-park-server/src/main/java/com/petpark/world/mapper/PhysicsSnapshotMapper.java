package com.petpark.world.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.petpark.world.entity.PhysicsSnapshot;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 世界物理快照 Mapper（崩溃续跑用）
 */
public interface PhysicsSnapshotMapper extends BaseMapper<PhysicsSnapshot> {

    /** 取最新快照（覆盖写：只保留最近一份，恢复时用） */
    @Select("SELECT * FROM world_physics_snapshot WHERE chunk_key = #{chunkKey} "
            + "ORDER BY tick DESC, id DESC LIMIT 1")
    PhysicsSnapshot selectLatest(@Param("chunkKey") String chunkKey);

    /** 清理该分片旧快照（保留最新一份） */
    @Delete("DELETE FROM world_physics_snapshot WHERE chunk_key = #{chunkKey} "
            + "AND id NOT IN (SELECT id FROM (SELECT id FROM world_physics_snapshot "
            + "WHERE chunk_key = #{chunkKey} ORDER BY tick DESC, id DESC LIMIT 1) t)")
    int deleteOlder(@Param("chunkKey") String chunkKey);
}
