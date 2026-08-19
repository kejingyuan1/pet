package com.petpark.ranch.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.petpark.ranch.entity.UserRanchAnimal;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 用户牧场动物 Mapper（沿用 user_world_state 模式，纯注解 SQL）。
 * 注意：本包未被 PetParkApplication 的 @MapperScan 覆盖（仅 com.petpark.mapper / com.petpark.world.mapper），
 * 故显式加 @Mapper 由 MyBatis 自动注册，避免改动启动类。
 */
@Mapper
public interface UserRanchAnimalMapper extends BaseMapper<UserRanchAnimal> {

    /** 查某用户已拥有的全部动物记录 */
    @Select("SELECT * FROM user_ranch_animals WHERE user_id = #{userId}")
    List<UserRanchAnimal> selectByUserId(@Param("userId") Long userId);

    /** INSERT IGNORE：已存在（并发重复购买）则静默跳过返回 0；否则插入返回 1 */
    @Insert("INSERT IGNORE INTO user_ranch_animals (user_id, animal_code) VALUES (#{userId}, #{code})")
    int insertIgnoreDuplicate(@Param("userId") Long userId, @Param("code") String code);
}
