package com.petpark.world.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 世界对象表（核心：玩家建筑 / 鱼塘 / 资源点）
 * 只存玩家产生的内容；地形本身不在此表。
 * state: 1 正常 / 0 拆除（软删，保留记录）；查询默认过滤 state=1。
 * extJson: JSON 文本（如 {"fishType":"goldfish"}），写入时服务端负责序列化。
 */
@Data
@TableName("world_objects")
public class WorldObject {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** chunk 标识：cx_cz（查询索引） */
    private String chunkKey;

    /** 世界格 X */
    private Integer gx;

    /** 世界格 Z */
    private Integer gz;

    /** 对象类型：house/shed/fish_pond/...（关联 categories.code） */
    private String type;

    /** 所有者用户ID */
    private Long ownerId;

    /** 朝向（弧度） */
    private BigDecimal rot;

    /** 附加状态 JSON 文本：{fishType, fishCount, level, ...} */
    private String extJson;

    /** 状态：1 正常 / 0 拆除 */
    private Integer state;

    private java.time.LocalDateTime createdAt;
    private java.time.LocalDateTime updatedAt;
}
