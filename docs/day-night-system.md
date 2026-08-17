# 昼夜系统（Day/Night Cycle）— 设计规格与交付说明

> 里程碑：P1 支柱① ｜ 状态：✅ 已实现并通过质量门 ｜ 负责人：World3d 大世界组
> 关联代码：`pet-park-server/.../world/service/WorldTimeService.java`、`WorldWsController.java`、`pet-park-ng/.../world3d/world3d.component.ts`

## 1. 设计目标
为 cozy 农场经营大世界提供**连续的昼夜节律**，增强沉浸感与时间感，并为后续玩法（夜间垂钓、作物生长速度、NPC 作息）预留时间相位信号。要求：
- 服务端为**唯一时间权威**（所有客户端一致，无作弊空间）；
- 前端平滑过渡，无生硬跳变；
- 周期内可见变化，且可配置节奏，不强迫玩家熬夜等待。

## 2. 时间模型
| 项 | 值 | 说明 |
|---|---|---|
| 完整一日 | `petpark.world.day-cycle-ms`（默认 **1200000ms = 20 分钟**） | 可在 `application.yml` 调整 |
| 相位 frac | `[0,1)` | `0 = 00:00 午夜`，`0.5 = 12:00 正午` |
| 太阳高度 elevation | `sin(2π·frac − π/2)` | `+1` 正午 / `−1` 午夜 |
| 夜晚判定 | `elevation < −0.1` | 太阳没入地平线 |
| 阶段名 | 午夜/深夜/黎明/清晨/正午/午后/黄昏/日落/夜晚 | HUD 显示用 |

游戏内时钟由 frac 线性映射到 `0..24h`，HUD 显示 `HH:MM` + 阶段图标（☀️/🌙）。

## 3. 服务端实现
- **`WorldTimeService`**（新）：计算当前相位 `Map{t,frac,hour,minute,elevation,isNight,phase,cycleMs}`。
  - `@Scheduled(fixedDelay=5000)` 每 5s 经 `RegionBroker.broadcastWorld(...)` 广播 `DAY_NIGHT` 到 `/topic/world`（single-room 全量可见）。
- **`WorldWsController.join`**：玩家接入时立即 `sendToUser` 当前相位，避免新客户端苦等周期广播。
- 依赖注入：`WorldWsController` 构造器新增 `WorldTimeService`；`WorldTimeService` 注入 `RegionBroker`。

## 4. 前端实现（Three.js）
- `initScene` 中把太阳/补光/半球光提升为类字段（`sunLight`/`fillLightRef`/`hemiLight`），供逐帧调制。
- `onWorldEvent` 接收 `DAY_NIGHT`：写入 `worldTime`，按 elevation 计算目标混合系数 `targetBlend = clamp((elevation+0.25)/0.5, 0, 1)`（0=夜，1=昼），更新 `timeLabel`/`phaseIcon`，并写入 `window.__petWorldTime`（E2E 探针用）。
- `updateDayNight(dt)`（每帧，`animate` 渲染前调用）：
  - `dayNightBlend` 以 ~1.5s 时间常数平滑逼近 `targetBlend`；
  - 天空色 `scene.background`、雾色 `scene.fog.color` 在夜/昼调色板间 `lerp`；
  - 太阳强度 `0.16→1.06`、颜色暖→冷、位置随 frac 绕行（夜晚压到地平线以下并降强度）；
  - 补光/半球光强度随 t 缩放；`toneMappingExposure` 夜 `0.82` → 昼 `1.15`。
- HUD：连接状态下方新增 `.hud-time`（`☀️/🌙 HH:MM 阶段名`）。
- 调试钩子：`window.__forcePhase(frac)` 强制相位、`window.__petSceneInfo()` 读取光照状态（仅供 E2E 确定性验证，无害）。

### 调色板
| 元素 | 白昼 | 夜晚 |
|---|---|---|
| 天空 background | `0x7EC8E8` | `0x0B1026` |
| 雾 fog | `0xA0C8D8` | `0x1A2240` |
| 太阳强度 | 1.06 | 0.16 |
| 曝光 | 1.15 | 0.82 |

## 5. 质量门（P1-①）
| 门 | 判定 | 结果 |
|---|---|---|
| A. 服务端广播 | `/topic/world` 每 ≤5s 收到 `DAY_NIGHT`，含 frac/elevation/phase | ✅ PASS |
| B. join 即时相位 | 新客户端接入即收到 `DAY_NIGHT` 私发 | ✅ PASS |
| C. HUD 显示 | `.hud-time` 出现且显示有效 `HH:MM` + 阶段名 | ✅ PASS |
| D. 昼夜过渡 | `__forcePhase(0)` vs `(0.5)` 下 `scene.background`/曝光/太阳强度明显不同 | ✅ PASS |
| E. 编译 | 后端 0 BUILD FAILURE、前端 ng serve 无报错 | ✅ PASS |

## 6. 后续扩展点
- 夜间专属鱼种（`isNight` 传给 `WorldFishingService` 加权）；
- 作物/动物生长速度随 frac 变化；
- 光照变化驱动萤火虫/路灯等装饰物显隐（前端据 `blend` 阈值切换）。
