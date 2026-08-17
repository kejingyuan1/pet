package com.petpark.world.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.petpark.entity.Category;
import com.petpark.mapper.CategoryMapper;
import com.petpark.world.mapper.WorldInventoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 图鉴服务（P1 养成支柱③）——收集册。
 *
 * 收集判定：以 world_inventory 为「曾拥有」依据（consume 仅把 qty 减到 0，不删行，
 * 故一旦拥有过即视为已发现）。无新增表，复用现有背包数据。
 *  - 鱼种：categories type='fish' status=1（服务端已有鱼种表）
 *  - 矿石：固定三种 ore_coal / ore_iron / ore_gold
 * 返回每物种的 code/name/discovered 及已发现计数，供前端图鉴面板渲染。
 */
@Slf4j
@Service
public class WorldCodexService {

    private static final String[][] ORES = {
        { "ore_coal", "煤矿" },
        { "ore_iron", "铁矿" },
        { "ore_gold", "金矿" }
    };

    private final WorldInventoryMapper inventoryMapper;
    private final CategoryMapper categoryMapper;

    public WorldCodexService(WorldInventoryMapper inventoryMapper, CategoryMapper categoryMapper) {
        this.inventoryMapper = inventoryMapper;
        this.categoryMapper = categoryMapper;
    }

    /** 图鉴：鱼 + 矿石，标已发现 */
    public Map<String, Object> codex(Long uid) {
        Set<String> owned = new HashSet<>();
        List<Map<String, Object>> rows = inventoryMapper.listByUid(uid);
        if (rows != null) {
            for (Map<String, Object> r : rows) {
                owned.add(String.valueOf(r.get("item_type")));
            }
        }

        // 鱼种
        List<Map<String, Object>> fish = new ArrayList<>();
        List<Category> fishes = categoryMapper.selectList(
                new LambdaQueryWrapper<Category>().eq(Category::getType, "fish").eq(Category::getStatus, 1));
        if (fishes == null) fishes = new ArrayList<>();
        for (Category c : fishes) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", c.getCode());
            m.put("name", c.getName() != null ? c.getName() : c.getCode());
            m.put("discovered", owned.contains(c.getCode()));
            fish.add(m);
        }

        // 矿石
        List<Map<String, Object>> ore = new ArrayList<>();
        for (String[] o : ORES) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", o[0]);
            m.put("name", o[1]);
            m.put("discovered", owned.contains(o[0]));
            ore.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("fish", fish);
        out.put("ore", ore);
        out.put("fishDiscovered", fish.stream().filter(m -> Boolean.TRUE.equals(m.get("discovered"))).count());
        out.put("oreDiscovered", ore.stream().filter(m -> Boolean.TRUE.equals(m.get("discovered"))).count());
        out.put("fishTotal", (long) fish.size());
        out.put("oreTotal", (long) ore.size());
        return out;
    }
}
