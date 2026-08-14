package com.petpark.world.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.petpark.world.entity.TerrainMod;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 地形修改 Mapper（M4 挖矿）
 *
 * 并发要点（与 WorldObjectService.insertIfAbsent 同源思路）：
 *  - insertIfAbsent 用 INSERT IGNORE + uk_cell：认领失败（已被他人/自己采过）返回 0，判 oreDepleted；
 *  - deleteOwned 仅删"自己刚认领但未完成扣能量"的记录（能量不足时退还认领，事务回滚）。
 */
public interface TerrainModMapper extends BaseMapper<TerrainMod> {

    /** 拉取某 chunk 全部地形修改（chunk 生成叠加用） */
    @Select("SELECT * FROM terrain_mods WHERE chunk_key = #{ck}")
    List<TerrainMod> listByChunk(@Param("ck") String ck);

    /** 该格是否已被修改（采空） */
    @Select("SELECT 1 FROM terrain_mods WHERE chunk_key = #{ck} AND gx = #{gx} AND gz = #{gz} LIMIT 1")
    Integer existsCell(@Param("ck") String ck, @Param("gx") int gx, @Param("gz") int gz);

    /** 认领矿格（防并发双采）；返回 affectedRows（1=认领成功，0=已被占用） */
    @Insert("INSERT IGNORE INTO terrain_mods (chunk_key, gx, gz, old_type, new_type, by_player) " +
            "VALUES (#{chunkKey}, #{gx}, #{gz}, #{oldType}, #{newType}, #{byPlayer})")
    int insertIfAbsent(TerrainMod mod);

    /** 退还认领（能量不足等异常路径，仅删自己刚写的记录） */
    @Delete("DELETE FROM terrain_mods WHERE chunk_key = #{ck} AND gx = #{gx} AND gz = #{gz} AND by_player = #{uid}")
    int deleteOwned(@Param("ck") String ck, @Param("gx") int gx, @Param("gz") int gz, @Param("uid") long uid);

    /** 矿脉再生：选出已被采空（new_type='empty' 且 old_type 为矿）且超过再生周期的记录 */
    @Select("SELECT * FROM terrain_mods "
            + "WHERE new_type = 'empty' AND old_type IN ('ore_coal','ore_iron','ore_gold') "
            + "AND created_at < FROM_UNIXTIME(#{cutoffMs} / 1000)")
    List<TerrainMod> selectMinedOlderThan(@Param("cutoffMs") long cutoffMs);

    /** 矿脉再生：按 id 批量删除采空记录（删记录即恢复底层矿脉） */
    @Delete("<script>DELETE FROM terrain_mods WHERE id IN "
            + "<foreach item='id' collection='ids' open='(' separator=',' close=')'>#{id}</foreach></script>")
    int deleteMinedByIds(@Param("ids") java.util.List<Long> ids);
}
