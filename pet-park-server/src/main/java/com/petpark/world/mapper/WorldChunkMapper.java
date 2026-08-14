package com.petpark.world.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.petpark.world.entity.WorldChunk;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 世界 chunk 缓存 Mapper（P2 审计缺口 #6）
 */
public interface WorldChunkMapper extends BaseMapper<WorldChunk> {

    /** 按 chunk 标识 + 世界版本读缓存（version 变化即失效，重新生成并覆盖） */
    @Select("SELECT * FROM world_chunks WHERE chunk_key = #{ck} AND version = #{v} LIMIT 1")
    WorldChunk selectByKeyVersion(@Param("ck") String ck, @Param("v") int v);
}
