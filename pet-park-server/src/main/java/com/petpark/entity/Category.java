package com.petpark.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 统一类目表：种植植物 / 养殖鱼 / 养殖动物 / 家具 全部一张表
 * type 区分：crop 植物 | fish 鱼 | animal 动物 | furniture 家具
 */
@Data
@TableName("categories")
public class Category {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;        // 标识：carrot / goldfish / chicken / bed
    private String name;        // 中文名
    private String type;        // crop | fish | animal | furniture
    private Integer price;      // 购买价（金币）
    private Integer sellPrice;  // 成熟/产出后售价
    private BigDecimal growDays;// 成长所需天数
    private BigDecimal feedDays;// 浇水/喂养间隔（天）
    private Integer exp;        // 收获/售卖所得经验
    private Integer levelReq;   // 解锁所需等级
    private String product;     // 产出物名称（动物：鸡蛋/鸭蛋/牛奶）
    private Integer prodPrice;  // 产出物售价
    private Integer satiety;    // 作为宠物食物时的饱食增加值
    private Integer energy;     // 作为宠物食物时的体力增加值
    private String color;       // UI 主题色
    private String iconSvg;     // 可选 SVG
    private Integer status;     // 1 启用 / 0 停用
    private Integer sortOrder;
    private LocalDateTime createdAt;
}
