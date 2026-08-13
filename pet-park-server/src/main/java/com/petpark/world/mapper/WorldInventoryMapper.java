package com.petpark.world.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.petpark.world.entity.WorldInventory;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/**
 * 世界背包 Mapper（M4 采矿）
 *
 *  - addQty：INSERT ... ON DUPLICATE KEY UPDATE qty = qty + #{delta}，原子累加采集物；
 *  - consume：条件扣减（qty >= #{qtyOut} 才扣），返回 affectedRows 用于校验库存充足；
 *  - qtyOf / listByUid：背包查询。
 */
public interface WorldInventoryMapper extends BaseMapper<WorldInventory> {

    /** 采集物 +delta（首次插入，重复累加） */
    @Insert("INSERT INTO world_inventory (uid, item_type, qty) VALUES (#{uid}, #{itemType}, #{delta}) " +
            "ON DUPLICATE KEY UPDATE qty = qty + #{delta}")
    int addQty(@Param("uid") Long uid, @Param("itemType") String itemType, @Param("delta") int delta);

    /** 当前玩家某物品库存量（无则返回 null） */
    @Select("SELECT qty FROM world_inventory WHERE uid = #{uid} AND item_type = #{itemType} LIMIT 1")
    Integer qtyOf(@Param("uid") Long uid, @Param("itemType") String itemType);

    /** 玩家全部背包条目 */
    @Select("SELECT item_type, qty FROM world_inventory WHERE uid = #{uid}")
    List<Map<String, Object>> listByUid(@Param("uid") Long uid);

    /** 条件扣减（库存不足返回 0） */
    @Update("UPDATE world_inventory SET qty = qty - #{qtyOut} WHERE uid = #{uid} " +
            "AND item_type = #{itemType} AND qty >= #{qtyOut}")
    int consume(@Param("uid") Long uid, @Param("itemType") String itemType, @Param("qtyOut") int qtyOut);
}
