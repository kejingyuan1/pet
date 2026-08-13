# 角色骨骼绑定方案（M7 之后）

> 状态：待执行（2026-08-13）。本文件记录从「离线刚性骨骼绑定」转向「外部专业绑定」的完整决策与操作步骤，供换电脑后无缝继续。

---

## 1. 背景与决策

- **M7 已废弃**：提交 `d037592`（已 push 到 `origin/main`）实现了「离线刚性骨骼绑定」——把 HY3D 碎片模型按质心硬聚类成 6 根骨骼（头/躯干/左臂/右臂/左腿/右腿），每根骨骼绕 pivot 刚性旋转，由 `world3d.component.ts` 的 `buildRiggedModel()` + `rig-configs.ts` 承载。
- **被否决原因**：实测穿模严重（手臂穿过躯干、碎片错位散架）。截图见用户反馈。
- **穿模根因（已纠正「裁剪太多」的误判——不是裁剪）**：
  1. 刚性绑定（rigid）无蒙皮权重，关节处两个刚性块天生互相穿插 / 留缝；
  2. HY3D 模型在几何上是 ~192 个**不连通的三角面簇**（同一 mesh / primitive 内的空间分离碎片，并非多个独立 mesh），按质心硬聚类不准，肩 / 胯等交界碎片被拆进两个骨骼而撕裂；
  3. pivot 取整组质心而非真正关节轴，手臂绕质心甩出而非绕肩摆，直接导致穿模。
- **结论**：HY3D 免费低模只适合做「不绑骨」的静态 / 整体律动展示；涉及绑定质量差，改走 **外部专业绑定 + 带权蒙皮 GLB** 路线。

---

## 2. 选定路线：Cinevva 浏览器 auto-rigger（首选）

- 地址：`https://www.cinevva.com/tools/rigger`（可能需注册一个免费 Sorceress 账号）
- 特点：输入 `GLB / FBX / OBJ`（≤ 30 MB），直接输出 **带蒙皮的 rigged GLB**；面向 AI 生成网格（Hunyuan 3D / Meshy 这类），对 Three.js 最友好（免去格式转换）。
- 操作步骤：
  1. 上传 `pet-park-ng/public/assets/models/boy.glb`（先 boy，成功再 girl）；
  2. 选 **biped（双足）**，等待自动识别关节 + 蒙皮；
  3. 预览确认四肢摆动正常、不穿模；
  4. **导出选 GLB 格式**（不要 FBX），下载到本地。
- 源 GLB 已在仓库（M5 提交）：`pet-park-ng/public/assets/models/boy.glb`（175 KB）、`girl.glb`（150 KB）。

---

## 3. 回退路线（若 Cinevva 失败）

> **实测**：`boy.glb` / `girl.glb` 均为 **单 mesh / 单 primitive**（boy: 3256 顶点、3722 三角形，含 NORMAL + TEXCOORD_0）。所谓「~190 碎片」是同一 primitive 内的**三角面连通分量**（空间分离、互不连通），并非多个 mesh。因此 `tools/merge_glb.py` 对它们是无操作（输出等价），仅对真正多 mesh 的 GLB 有效。

- **真正风险**：单 mesh 但内部**不连通**的几何，auto-rigger 可能因三角面分离而权重混乱 / 绑定失败。
- **若 Cinevva 因此失败，回退手段**：
  1. 在 **Blender** 导入 GLB → `Mesh > Clean Up > Merge by Distance` 焊接邻近顶点，或用 **Remesh / Quad Remesh** 重建为连通体；
  2. 或**重新用 HY3D 生成**一版更连续（碎片更少 / 更整体）的模型再传；
  3. 仍备选桌面工具：**AccuRig 2.0**（Windows 免费，OBJ / FBX 导入，19 关节 + 手指，导出 FBX，明确支持多网格）、**Mixamo**（免费但强制 T-pose、已停维护）、**Blender Rigify / Auto-Rig Pro**（$50，行业标准）。

---

## 4. pet-park 接入计划（拿到 rigged GLB 后由工程侧执行）

1. 删除 `pet-park-ng/src/app/components/world3d/rig-configs.ts` 与 `world3d.component.ts` 中的 `buildRiggedModel()`（刚性骨骼逻辑）。
2. 改为用 `GLTFLoader` 直接加载带骨骼 + 蒙皮的 rigged GLB。
3. 动作驱动：
   - 优先：若 GLB 自带 `idle / walk / run / bend` 动画剪辑 → 用 `THREE.AnimationMixer` 播放；
   - 否则：用现有状态机旋转其骨骼（Cinevva 输出 Mixamo 兼容骨架，命名可控，可映射）。
4. 保留：巡逻 / 面向逻辑（root 组位置 + 朝向）。
5. 验证：复用 `_preview/m7_bone_verify.cjs` 思路（生产级 Playwright 断言骨骼在动、过滤 404 后控制台错误 = 0）。

---

## 5. 当前进度（2026-08-13）

- [x] M7 刚性绑定方案实现 + 提交 + 推送（`d037592`）
- [x] 确认刚性绑定穿模根因，方案被否决
- [x] 锁定外部绑定路线（Cinevva 首选，合并脚本回退）
- [x] 编写 `tools/merge_glb.py`（通用多 mesh 合并工具，已自测；boy/girl 为单 mesh 故对它们无操作）
- [ ] **待用户上传 boy.glb 到 Cinevva，拿回 rigged GLB**
- [ ] 接入 pet-park（替换刚性绑定代码，加载 skinned GLB）
- [ ] 提交 + 推送接入改动

---

## 6. 备选工具对比（2026-08 核实）

| 工具 | 平台 | 输入 | 输出 | 备注 |
|------|------|------|------|------|
| Cinevva / Sorceress | 浏览器 | GLB/FBX/OBJ ≤30MB | rigged GLB | 面向 AI 网格，最对口 Three.js |
| AccuRig 2.0 | Win 免费 | OBJ/FBX | FBX/USD | 19 关节 + 手指，支持多网格 |
| Mixamo | 浏览器 | FBX/OBJ（需 T-pose） | FBX/DAE | 免费但已停维护，强制 T-pose |
| Blender Rigify / Auto-Rig Pro | 桌面 | 任意 | 任意 | 行业标准，需学习 |
| Unity | 引擎 | 消费骨骼动画 | — | **非绑定工具** |
