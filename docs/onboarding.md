# 新手引导（Onboarding）— 设计规格与交付说明

> 里程碑：P1 支柱② ｜ 状态：✅ 已实现并通过质量门 ｜ 负责人：World3d 大世界组
> 关联代码：`pet-park-ng/.../world3d/world3d.component.ts`（模板 `.onboard` + 控制逻辑 `maybeStartOnboarding`/`nextOnboarding`/`finishOnboarding`/`advanceOnboardingIf`）

## 1. 设计目标
让首次进入大世界的玩家通过**分步卡片**快速理解核心操作（移动 / 采矿 / 钓鱼 / 建造），降低上手门槛；老玩家不再被打扰。
- 仅首次出现（localStorage `pp_onboarded` 去重）；
- 既可手动「下一步/跳过」，也会在玩家**真实完成对应动作时自动推进**，形成引导闭环；
- 不阻断操作（卡片置于底部，不遮挡摇杆/工具栏）。

## 2. 引导步骤（5 步）
| 步 | 标题 | 教学点 | 自动推进触发 |
|---|---|---|---|
| 1 | 欢迎来到宠物乐园大世界 | 摇杆 / WASD / 方向键移动 | （手动） |
| 2 | 采矿 | 靠近矿石 → ⛏️ / F | `MINE_RESULT` code=0 |
| 3 | 钓鱼 | 走到水边 → 🎣 / G | `FISH_RESULT` code=0 |
| 4 | 建造农场 | 工具栏「建造」放置 | `BUILD_RESULT` code=0 |
| 5 | 开始你的冒险 | 提示按 H 看帮助 | 点「完成」关闭 |

## 3. 前端实现
- **触发**：`initScene()` 末尾调用 `maybeStartOnboarding()`——仅当 `localStorage` 无 `pp_onboarded` 时 `showOnboarding=true; onboardingStep=0`。
- **模板**：`.onboard` 卡片（底部居中，z-index 15），显示「第 N / 5 步」+ 标题 + 描述 + 「跳过 / 下一步」按钮。
- **控制**：
  - `nextOnboarding()`：步进，末步视为完成；
  - `finishOnboarding()`：关闭并写 `localStorage.pp_onboarded='1'`；
  - `advanceOnboardingIf(step)`：动作成功且当前停在该步时自动前进（避免重复触发）。
- **持久化**：完成/跳过写入 `localStorage`，再次进入不弹出（去重）。
- **调试钩子**（E2E 用，无害）：`__onboarding()` 读状态、`__resetOnboarding()` 重置、`__simulateFirstEntry()` 走真实首入判定逻辑。

## 4. 质量门（P1-②）
| 门 | 判定 | 结果 |
|---|---|---|
| A. 首入出现 | 全新用户进大世界 → `.onboard` 出现且「第 1 / 5 步」 | ✅ PASS |
| B. 步骤推进 | 点「下一步」→「第 2 / 5 步」 | ✅ PASS |
| C. 跳过+持久化 | 点「跳过」→ 卡片消失且 `pp_onboarded='1'` | ✅ PASS |
| D. 二次去重 | 已引导后 `__simulateFirstEntry()` 返回 false | ✅ PASS |
| E. 无 console error | 进世界 + 首 6s 0 错误 | ✅ PASS |

## 5. 后续扩展点
- 动作触发改为「靠近目标即高亮该步」（结合现有 `nearestOre`/`nearWater` 检测）；
- 引导进度存服务端（按 uid），跨设备同步；
- 加入箭头/手指动画指向具体按钮（教学聚焦）。
