package com.petpark.world.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.petpark.world.entity.WorldObject;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/**
 * 世界对象 Mapper
 *
 * 并发原子化（ADR-W4）：insertIfAbsent 用「条件 INSERT + WHERE NOT EXISTS」防同 cell 双置，
 * 判 affectedRows==1 而非先查后插；DuplicateKeyException 兜底由 GlobalExceptionHandler 映射。
 */
public interface WorldObjectMapper extends BaseMapper<WorldObject> {

    /**
     * 条件 INSERT：目标 cell 无 state=1 对象时才插入（防双置建筑/鱼塘竞态）。
     * 返回 affectedRows（1=成功，0=已被占用）。
     */
    @Insert("INSERT INTO world_objects (chunk_key, gx, gz, type, owner_id, rot, ext_json, state) "
            + "SELECT #{chunkKey}, #{gx}, #{gz}, #{type}, #{ownerId}, #{rot}, CAST(#{extJson} AS JSON), 1 "
            + "FROM DUAL "
            + "WHERE NOT EXISTS (SELECT 1 FROM world_objects "
            + "                   WHERE chunk_key = #{chunkKey} AND gx = #{gx} AND gz = #{gz} AND state = 1)")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertIfAbsent(WorldObject obj);

    /** 按 chunk 拉取该区域全部正常对象（含 owner 昵称），供 chunk 响应 / 快照 */
    @Select("SELECT o.id, o.chunk_key, o.gx, o.gz, o.type, o.rot, o.ext_json, o.state, "
            + "o.owner_id, u.nickname AS owner_nick "
            + "FROM world_objects o JOIN users u ON u.id = o.owner_id "
            + "WHERE o.chunk_key = #{chunkKey} AND o.state = 1 "
            + "ORDER BY o.id")
    List<Map<String, Object>> listByChunk(@Param("chunkKey") String chunkKey);

    /** 按 cell 取该格正常对象（拆除/升级定位用；uk_chunk_cell 保证至多 1 条） */
    @Select("SELECT * FROM world_objects WHERE chunk_key = #{ck} AND gx = #{gx} AND gz = #{gz} AND state = 1 LIMIT 1")
    WorldObject selectAt(@Param("ck") String ck, @Param("gx") int gx, @Param("gz") int gz);

    /** 软删（state=0 保留记录），仅删自己刚操作的这条 */
    @Update("UPDATE world_objects SET state = 0, updated_at = NOW() WHERE id = #{id} AND state = 1")
    int softDelete(@Param("id") long id);

    /** 回写 ext_json（升级等级 / 鱼塘生长状态落库） */
    @Update("UPDATE world_objects SET ext_json = CAST(#{extJson} AS JSON), updated_at = NOW() WHERE id = #{id}")
    int updateExtJson(@Param("id") long id, @Param("extJson") String extJson);
}
