# 大世界（WORLD）上线功能缺口清单

> 对比基准：`assets/3d_build/docs/world-game/01-architecture.md`（v1.0 架构，M1–M4 里程碑验收）
> 实际代码：`pet-park-server/src/main/java/com/petpark/world/**`
> 当前形态：`WORLD_README.md` v49（Voronoi 群岛 + 服务端权威物理 Rapier + 采矿）
> 更新：2026-08-14

---

## 一、已完整实现（对照验收，证明达标面）

| 里程碑 | 规划验收 | 实际状态 |
|---|---|---|
| **M1 原型** | 地形生成 + chunk 渲染 + OrbitControls | ✅ TerrainService 群岛生成 + 顶点色渲染 + 相机跟随 |
| **M2 单人玩法** | 放置建筑/养鱼校验 + world_objects 落库 + 私有存档 | ✅ `placeBuild`（buildable 校验 + 占用校验 + 扣款事务 + 广播）、`stockFish`（water 校验 + 落库）、state_json 沿用 |
| **M3 多人** | WS 区域广播 + 玩家位置 + 聊天 | ✅ RegionBroker（join/position/chat/build/mine）、POSITION_SNAPSHOT、PLAYER_JOIN/LEAVE、CHAT 单室广播 |
| **M4 打磨** | 地形修改/资源采集/性能 | ✅ 采矿（能量/经验/背包/售卖）、TERRAIN_CHANGE 区域广播、60Hz 物理引擎 |

---

## 二、功能缺口（设计规划、代码未实现）—— 上线前必须补

### 1. 拆除建筑（OBJECT_REMOVE / 软删 state=0）
- **规划**：架构 §7.2 列 `OBJECT_REMOVE` 事件；`world_objects.state` 软删设计（state=0 保留记录）。
- **现状**：`WorldObjectService` **无 remove 方法**，`WorldWsController` 无 `/ws.remove`。玩家建了房子/鱼塘**无法拆除**。
- **影响**：玩家误操作或重建需求无法满足；线上会产生大量不可清理的占位对象。
- **建议**：新增 `removeObject(uid, objectId)`（校验 owner + 软删 + 广播 OBJECT_REMOVE + 退还/不退还金币需定规则）。

### 2. 矿脉再生定时任务
- **规划**：db-schema §5 明确要求「定时任务删除 terrain_mods 记录 → 矿 cell 恢复生成语义（煤铁 24h / 金 72h 再生）」。
- **现状**：`WorldMiningService` 只有「懒计算能量再生」，**无任何 `@Scheduled` 矿脉再生任务**（仅 `RegionBroker.sweepIdle` 是玩家空闲剔除，与矿无关）。矿挖空后 `terrain_mods` 记录**永久留存 → 矿永久消失**。
- **影响**：矿产是不可再生的一次性资源，长期运营矿脉枯竭，玩法崩坏。
- **建议**：新增 `@Scheduled` 任务，按 ore 类型周期清理过期 `terrain_mods`（`created_at < NOW()-INTERVAL`）。

### 3. 鱼塘养殖循环（鱼生长/产出/收获）
- **规划**：架构 §9.2 提「产出冷却（lastProductDay + grow_days）」；养殖应有周期产出。
- **现状**：`stockFish` 只放占位 `fish_pond`（ext_json 仅 `{fishType}`），**无生长、无产出冷却、无收获 API**。鱼塘是空壳。
- **影响**：养鱼玩法无实际收益，与「湖里养鱼」的玩法承诺不符。
- **建议**：补 `ext_json` 生长进度（growDays）+ 产出/收获接口（OBJECT_UPDATE 事件）。

### 4. 建筑升级（OBJECT_UPDATE / level）
- **规划**：架构 §7.2 列 `OBJECT_UPDATE` 事件（「生长/状态变更」）。
- **现状**：`WorldObjectService` 无 updateObject/upgrade 逻辑。
- **影响**：建筑无成长线，玩法深度不足（非阻塞，可排期）。

### 5. 等级门槛校验（categories.level_req）
- **规划**：架构 §8.1 明确「玩家权限（金币/等级，按 categories 表配置）」。
- **现状**：`placeBuild`/`stockFish` 只校验 `price` 扣款，**未校验 `level_req`**（如石屋需 2 级、金矿需 3 级）。
- **影响**：低级玩家可越级建造/采高级矿，破坏经济梯度。
- **建议**：放置/养鱼前 `if (cat.getLevelReq() > user.getLevel()) throw WorldErrors.levelNotEnough()`。

### 6. world_chunks 缓存落库
- **规划**：架构 §2/§6 列 `world_chunks` 为「可选缓存、加速重启」。
- **现状**：代码**无 WorldChunk 实体/Mapper**，地形每次实时确定性生成，**未落库缓存**。
- **影响**：重启需重算地形（确定性可重算，功能 OK，但大世界范围下重启成本随探索增长）。
- **建议**：非阻塞，可作为性能优化排期（建表语句已在本仓库 `production/sql/world_init.sql` 预留）。

---

## 三、已知待优化（WORLD_README「待优化」已列，非阻塞）

| # | 项 | 说明 |
|---|---|---|
| 7 | 岛屿边缘进一步平滑 | 防悬崖视觉 |
| 8 | 海浪 shader 性能优化 | 高频顶点动画开销 |
| 9 | 矿石密度降低 | 当前偏密 |
| 10 | 双击移动加寻路 | 当前双击为直线冲，无 A* 寻路（会卡树/穿障碍） |
| 11 | 远端玩家跳跃动画 | 本地物理权威，远端玩家位置快照无跳跃插值动画 |

---

## 四、设计与实现偏差（文档未同步，需回填）

| # | 偏差 | 说明 |
|---|---|---|
| 12 | CellType 类型定义落后 | 架构 §4.3 列 `water/sand/grass/mountain/tree/rock`，**缺 `ore_coal/ore_iron/ore_gold`**；代码已扩展（采矿引入）。设计文档需回填。 |
| 13 | 物理引擎超出非目标 | 架构 §1.3 非目标「不做物理引擎 / 碰撞体」，但 v49 **已实现 Rapier 60Hz 物理**（超额完成）。需评估是否纳入上线范围与回归。 |
| 14 | 世界范围不一致 | 架构 §10 默认 2048×2048 chunk，代码 `world_radius` 默认 1024。 |

---

## 五、超额完成（非缺失，记录备查）

- **服务端权威物理引擎**（Rapier，60Hz tick，重力+跳跃+语义碰撞，10Hz 快照广播）—— 超出 v1.0 设计，显著增强手感。
- **TERRAIN_CHANGE 实时区域广播** —— 多人下他人可见矿坑变化（设计仅要求落库）。

---

## 六、上线前优先级建议

- **P0（必须补，否则玩法崩坏）**：#2 矿脉再生、#1 拆除建筑、#5 等级门槛校验
- **P1（玩法完整性）**：#3 鱼塘养殖循环
- **P2（深度/性能）**：#4 建筑升级、#6 chunk 缓存、#10 寻路
- **文档回归**：#12/#13/#14 将设计文档与实际对齐
