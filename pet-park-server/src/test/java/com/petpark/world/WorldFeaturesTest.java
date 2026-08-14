package com.petpark.world;

import com.petpark.common.BizException;
import com.petpark.common.Result;
import com.petpark.world.dto.HarvestResult;
import com.petpark.world.dto.WorldObjectResp;
import com.petpark.world.entity.TerrainMod;
import com.petpark.world.entity.WorldObject;
import com.petpark.world.geo.CellType;
import com.petpark.world.geo.ChunkKey;
import com.petpark.world.mapper.TerrainModMapper;
import com.petpark.world.mapper.WorldObjectMapper;
import com.petpark.world.service.TerrainService;
import com.petpark.world.service.WorldMiningService;
import com.petpark.world.service.WorldObjectService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 大世界玩法集成测试（P0 拆除/等级门槛、P2 升级、P1 养殖、P0 矿脉再生）
 * 连接本地 MySQL（root/123456/pet_park）；整类 @Transactional 自动回滚，不污染业务数据。
 * 固定使用测试用户 uid=1（coins 充足、level=1）。
 */
@SpringBootTest
@Transactional
public class WorldFeaturesTest {

    /** 测试用户：与线上 tester01(id=1) 一致，coins 充足、level=1 */
    private static final long UID = 1L;

    @Autowired
    private WorldObjectService objectService;
    @Autowired
    private WorldMiningService miningService;
    @Autowired
    private WorldObjectMapper objectMapper;
    @Autowired
    private TerrainModMapper terrainModMapper;
    @Autowired
    private TerrainService terrain;

    /** 在出生点附近找一块可建造且未被占用的草地/沙地 */
    private int[] findBuildableCell() {
        int[] sp = terrain.findSpawn();
        for (int r = 0; r <= 30; r++) {
            for (int dx = -r; dx <= r; dx++) {
                for (int dz = -r; dz <= r; dz++) {
                    int gx = sp[0] + dx, gz = sp[1] + dz;
                    if (!terrain.inWorld(gx, gz)) continue;
                    CellType t = terrain.semanticAt(gx, gz);
                    if ((t == CellType.GRASS || t == CellType.SAND) && terrain.isBuildable(gx, gz)) {
                        if (objectMapper.selectAt(ChunkKey.ofWorld(gx, gz), gx, gz) == null) {
                            return new int[]{gx, gz};
                        }
                    }
                }
            }
        }
        throw new IllegalStateException("测试环境找不到可建造空地");
    }

    @Test
    public void testPlaceAndRemove() {
        int[] c = findBuildableCell();
        Result<WorldObjectResp> placed = objectService.placeBuild(UID, c[0], c[1], "wood_house", 0.0);
        assertEquals(0, placed.getCode(), "放置应成功");
        assertNotNull(placed.getData());
        long id = placed.getData().getId();

        // 拆除（仅自己可拆）
        Result<WorldObjectResp> removed = objectService.removeObject(UID, c[0], c[1]);
        assertEquals(0, removed.getCode(), "拆除应成功");

        // 软删后 selectAt（仅查 state=1）应为 null
        assertNull(objectMapper.selectAt(ChunkKey.ofWorld(c[0], c[1]), c[0], c[1]),
                "软删后该格不应再被定位到");

        // 拆别人的对象应拒绝
        assertThrows(BizException.class,
                () -> objectService.removeObject(999999L, c[0], c[1]),
                "拆非自己对象应抛 notOwner");
    }

    @Test
    public void testUpgrade() {
        int[] c = findBuildableCell();
        objectService.placeBuild(UID, c[0], c[1], "wood_house", 0.0);

        Result<WorldObjectResp> up = objectService.upgradeObject(UID, c[0], c[1]);
        assertEquals(0, up.getCode(), "升级应成功");
        // ext_json 中 level 应为 2
        Object ext = up.getData().getExtJson();
        assertTrue(ext instanceof java.util.Map, "ext_json 应为 Map");
        Object lvl = ((java.util.Map<?, ?>) ext).get("level");
        assertEquals(2, ((Number) lvl).intValue(), "升级后等级应为 2");

        // 升到上限（Lv3）后再升应拒绝
        objectService.upgradeObject(UID, c[0], c[1]); // → Lv3
        assertThrows(BizException.class,
                () -> objectService.upgradeObject(UID, c[0], c[1]),
                "已达上限再升级应抛 maxLevel");
    }

    @Test
    public void testLevelReqGate() {
        int[] c = findBuildableCell();
        // stone_house level_req=2，测试用户 level=1 → 等级不足
        assertThrows(BizException.class,
                () -> objectService.placeBuild(UID, c[0], c[1], "stone_house", 0.0),
                "等级不足放置石屋应抛 levelNotEnough");
        // wood_house level_req=1，level=1 可通过
        Result<WorldObjectResp> ok = objectService.placeBuild(UID, c[0], c[1], "wood_house", 0.0);
        assertEquals(0, ok.getCode());
    }

    @Test
    public void testFishHarvestCycle() {
        int[] c = findBuildableCell();
        // 直接插入一个鱼塘（plantedAt 已过去一轮 → 成熟）
        WorldObject pond = new WorldObject();
        pond.setChunkKey(ChunkKey.ofWorld(c[0], c[1]));
        pond.setGx(c[0]);
        pond.setGz(c[1]);
        pond.setType("fish_pond");
        pond.setOwnerId(UID);
        pond.setRot(BigDecimal.ZERO);
        pond.setState(1);
        pond.setExtJson("{\"fishType\":\"goldfish\",\"plantedAt\":" + (System.currentTimeMillis() - 100000)
                + ",\"cycleMs\":60000}");
        objectMapper.insert(pond);

        Result<HarvestResult> h = objectService.harvestFish(UID, c[0], c[1]);
        assertEquals(0, h.getCode(), "收获应成功");
        assertTrue(h.getData().isReady(), "应已成熟");
        assertTrue(h.getData().getReward() > 0, "成熟应发放奖励");

        // 未成熟：新插入的鱼塘（plantedAt=now）收获应返回 ready=false
        WorldObject fresh = new WorldObject();
        fresh.setChunkKey(ChunkKey.ofWorld(c[0] + 1, c[1] + 1));
        fresh.setGx(c[0] + 1);
        fresh.setGz(c[1] + 1);
        fresh.setType("fish_pond");
        fresh.setOwnerId(UID);
        fresh.setRot(BigDecimal.ZERO);
        fresh.setState(1);
        fresh.setExtJson("{\"fishType\":\"goldfish\",\"plantedAt\":" + System.currentTimeMillis()
                + ",\"cycleMs\":60000}");
        objectMapper.insert(fresh);

        Result<HarvestResult> nh = objectService.harvestFish(UID, c[0] + 1, c[1] + 1);
        assertEquals(0, nh.getCode());
        assertFalse(nh.getData().isReady(), "新鱼塘不应成熟");
        assertTrue(nh.getData().getRemainingMs() > 0, "应返回剩余等待时间");
    }

    @Test
    public void testOreRegen() {
        // 插入一条「2 小时前采空」的矿脉记录
        TerrainMod m = new TerrainMod();
        m.setChunkKey("0_0");
        m.setGx(7);
        m.setGz(7);
        m.setOldType("ore_iron");
        m.setNewType("empty");
        m.setByPlayer(UID);
        m.setCreatedAt(LocalDateTime.now().minusHours(2));
        terrainModMapper.insert(m);

        // 执行再生（默认 oreRegenMs=120000，2h 前的记录应被删除）
        miningService.regenExpiredOres();

        List<TerrainMod> remaining = terrainModMapper.selectMinedOlderThan(System.currentTimeMillis() - 120000);
        boolean stillThere = remaining.stream().anyMatch(x -> x.getId().equals(m.getId()));
        assertFalse(stillThere, "过期采空矿脉应在再生中被删除（恢复底层矿脉）");
    }
}
