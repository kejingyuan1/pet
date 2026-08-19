package com.petpark.ranch.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户牧场拥有动物权威表（user_ranch_animals）
 * 复合主键 (user_id, animal_code)；bought_at 由 DB 默认 CURRENT_TIMESTAMP 维护。
 * 仅通过自定义 Mapper 方法读写（selectByUserId / insertIgnoreDuplicate），不依赖 MP 通用 CRUD。
 * 沿用工程 B（v50）user_world_state 的 MyBatis-Plus 模式。
 */
@Data
@TableName("user_ranch_animals")
public class UserRanchAnimal {

    /** 用户ID（关联 users.id）；手动提供，不自动生成 */
    @TableId(value = "user_id", type = IdType.INPUT)
    private Long userId;

    /** 动物代码（cat/dog/chicken/duck/cow/sheep/fish） */
    private String animalCode;

    /** 购买时间（DB DEFAULT CURRENT_TIMESTAMP 自动维护） */
    private LocalDateTime boughtAt;
}
