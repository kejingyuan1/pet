# 养成循环深化（Cultivation Loop）— 设计规格与交付说明

> 里程碑：P1 支柱③ ｜ 状态：✅ 已实现并通过质量门（A/B/C/D/E 全 PASS）｜ 负责人：World3d 大世界组
> 关联代码：
> - 后端：`pet-park-server/.../world/service/WorldCultivationService.java`、`WorldCodexService.java`、`world/controller/CodexController.java`、`world/service/WorldFishingService.java`、`world/service/WorldMiningService.java`
> - 前端：`pet-park-ng/.../world3d/world3d.component.ts`（`.cult` 面板 / `toggleCult` / `loadCultivation` / `loadCodex`）、`pet-park-ng/.../services/world-api.service.ts`（`cultivation()` / `codex()`）

## 1. 设计目标
将 P1 的「采集」（钓鱼 / 采矿）从一次性动作升级为**可持续的养成循环**：玩家通过采集获得经验与等级、消耗能量、积累鱼/矿图鉴、逐步解锁新玩法。要求：
- 收益曲线**服务端权威、参数化可调**，前端仅展示；
- 图鉴以「**曾拥有即发现**」为判定，零新增表，复用现有 `world_inventory`；
- 解锁里程碑清晰可见，给出「下一个目标」指引，驱动长线留存；
- 与昼夜、新手引导共同构成 P1 三大支柱，互相衔接（采集动作同时推进引导与养成）。

## 2. 收益模型（权威常量）
所有数值集中在后端 service 常量，**不与前端硬编码耦合**，便于平衡调整。

| 项 | 值 | 说明 |
|---|---|---|
| 升级经验阈值 `EXP_PER_LEVEL` | **100** | `level = 1 + floor(exp / 100)` |
| 钓鱼经验基准 `FISH_EXP_BASE` | **8** | 实际取该鱼种 `categories.exp`（DB 优先，缺省回退 8） |
| 采矿经验基准 `MINE_EXP_BASE` | **10** | 实际取该矿种 `categories.exp`（缺省回退 10） |
| 钓鱼耗能 `FISH_ENERGY_COST` | **3** | 能量不足则 `insufficientEnergy` |
| 采矿耗能 `MINE_ENERGY_COST` | **4** | 同上 |
| 能量上限 `MAX_ENERGY` | **100** | 与采集共用 |
| 能量再生 `REGEN_MS` | **1500ms / 1 点** | 即 `energyRegenPerSec ≈ 0.667`；懒计算（regenEnergy 幂等） |

经验来源：鱼/矿的 `categories.exp`（已在 `WorldFishingService` / `WorldMiningService` 中通过 `userMapper.addExperience(uid, exp)` 累加，与养成共用同一 `exp` 字段）。

## 3. 解锁里程碑（等级阶梯）
到达对应等级即 `unlocked=true`（前端显示高亮；实际玩法门控如「铁矿/金矿可采」可后续在采集 service 接入等级校验）。

| 等级 | 里程碑 | 含义 |
|---|---|---|
| Lv.1 | 初入乐园 · 基础采集 | 默认解锁（钓鱼/采煤矿） |
| Lv.2 | 铁矿开采 | 开放 `ore_iron` 采集 |
| Lv.3 | 稀有鱼种图鉴 | 图鉴扩展/稀有鱼权重 |
| Lv.5 | 金矿开采 | 开放 `ore_gold` 采集 |
| Lv.8 | 高级建筑蓝图 | 高级 build objectType 解锁 |
| Lv.12 | 传说渔场 | 传说鱼种渔场 |

## 4. 图鉴（Codex）判定
- **鱼种**：`categories type='fish' and status=1`（服务端已有鱼种表；当前 `codex` 返回 4 种）。
- **矿石**：固定三档 `ore_coal` / `ore_iron` / `ore_gold`。
- **已发现判定**：以 `world_inventory.listByUid(uid)` 的 `item_type` 集合为「曾拥有」依据。
  - `consume` 仅把 `qty` 减到 0（不删行），故**一旦拥有过即视为已发现**，无需新增任何表。
  - 钓鱼/采矿成功时 `inventoryMapper.addQty(uid, code, 1)` 写入，图鉴即时反映。
- 返回结构：`{ fish:[{code,name,discovered}], ore:[...], fishDiscovered, oreDiscovered, fishTotal, oreTotal }`。

## 5. 后端接口
| 方法 | 路径 | 说明 | 返回 |
|---|---|---|---|
| GET | `/api/world/cultivation` | 养成汇总 | `{level, exp, expToNext, energy, maxEnergy, coins, yield{...}, unlocks[6]}` |
| GET | `/api/world/codex` | 图鉴 | `{fish[], ore[], fishDiscovered, oreDiscovered, fishTotal, oreTotal}` |

- `WorldCultivationService.summary(uid)`：先 `regenEnergy` 再读 `User`，组装等级/经验/能量/积分 + 收益曲线 + 解锁阶梯。
- `WorldCodexService.codex(uid)`：鱼种 + 矿石 + 已发现计数。
- `CodexController`：`@RestController @RequestMapping("/api/world")`，uid 取自 `JwtAuthFilter.ATTR_USER_ID`。

## 6. 前端实现（Three.js + Angular）
- 工具栏新增 `📖 养成` 按钮 → `toggleCult()`：开时调 `loadCultivation()` / `loadCodex()`（经 `world-api.service`）。
- `.cult` 面板：
  - 等级 `Lv.N` + 经验进度条（宽度 `cultExpPercent = exp % 100`）；
  - 能量 / 积分摘要（来自 `cultivation.yield` 与 `energy/maxEnergy/coins`）；
  - `.codex-grid` 鱼/矿网格（`codex.fish` / `codex.ore`，已发现高亮）；
  - `.unlock-row` 解锁里程碑列表（6 行，`unlocked` 状态区分）。
- 养成与采集/引导联动：`handleFishResult` 成功 → `advanceOnboardingIf(2)`；`handleMineResult` 成功 → `advanceOnboardingIf(1)`；`BUILD_RESULT` 成功 → `advanceOnboardingIf(3)`（见 `onboarding.md`）。

## 7. 质量门（P1-③）
| 门 | 判定 | 结果 |
|---|---|---|
| A. 面板渲染 | `.cult` 出现，含等级 + 鱼/矿图鉴网格（≥1 鱼格）+ 解锁里程碑（≥5 行） | ✅ PASS |
| B. cultivation REST | `GET /api/world/cultivation` 返回 `level/exp/energy/coins/unlocks(≥5)` | ✅ PASS |
| C. codex REST | `GET /api/world/codex` 返回 `fish[]/ore[]`（含 `discovered`） | ✅ PASS |
| D. 端到端图鉴更新 | STOMP 钓鱼成功 → 重拉 `codex.fishDiscovered` 增加（实测 `0 → 1`，锦鲤 +16exp） | ✅ PASS |
| E. 无 console error | 进世界 + 首 6s 无 `console.error` / `pageerror` | ✅ PASS |

> **D 门历史说明**：早期 E2E 曾标 CONCERN——因探针与原 `world3d` 页面**同 uid 双会话**，world3d 自动 join 把物理权威位置覆盖回非临水出生点，导致钓鱼临水校验失败、探针超时。该现象为**测试探针竞态，非功能缺陷**：钓鱼→背包→图鉴全链路在隔离单会话下确定性通过（`_probe_fish2.cjs` 实测 `FISH_RESULT.code=0` 且 `fishDiscovered 0→1`）。正式 E2E 已改为「不打开 world3d 的隔离页面」钓鱼，D 门转为确定性 PASS。

## 8. 后续扩展点
- 解锁阶梯真正门控采集（Lv.2 起允许 `ore_iron`、Lv.5 起 `ore_gold`，在 `WorldMiningService` 加等级校验）；
- 图鉴稀有度权重（Lv.3 起提高稀有鱼 `categories.exp`/出现率）；
- 收益曲线外置到配置（目前为 service 常量，后续可移到 `application.yml` 实现热调参）；
- 每日/每周养成任务（基于 `exp`/`coins` 增量目标）。
