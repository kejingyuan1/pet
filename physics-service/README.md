# physics-service — 大世界服务端权威物理服务（M2 · ADR-W7 候选②）

Node.js + `@dimforge/rapier3d-deterministic-compat@0.20.0` 独立物理进程：
固定 1/60s 单线程模拟，服务端求解玩家移动/贴地/阻挡，快照下行，崩溃可恢复。

## 运行

```bash
# Node 使用项目约定版本（C:\Users\WIN11\.workbuddy\binaries\node\versions\22.22.2）
"C:/Users/WIN11/.workbuddy/binaries/node/versions/22.22.2/node.exe" src/index.js
# 或 npm start（package.json 已锁 @dimforge/rapier3d-deterministic-compat@0.20.0 + ws）
```

端口（环境变量可覆盖）：控制面 HTTP `:18080` · 数据面 WS `:18081`。

## 控制面 HTTP :18080

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 心跳：`{ok, tick, players, terrainChunks, objects, bodies}` |
| POST | `/load_world` | 初始化世界：`{seed, version, gravityY, terrain:[{chunkKey,cx,cz,heights}], objects, players}` |
| POST | `/add_collider` | 增量：`{type:'terrain_chunk'\|'object'\|'player', ...}`（terrain 需 heights；object 需 id/gx/gz/baseY/halfExtents；player 需 uid/gx/gz/y） |
| POST | `/remove_collider` | 增量：`{type, chunkKey?\|id?\|uid?}` |
| GET | `/snapshot` | 全量二进制快照（World.takeSnapshot），头 `X-Tick` / `X-Body-Count` |
| POST | `/restore` | 二进制体恢复（deserializeAll），头 `X-Tick` 对齐 tick |

## 数据面 WS :18081

- 上行（Spring Boot 转发，已鉴权）：
  - `{t:'input', uid, seq, dx, dz, run}` —— 输入意图（dx/dz ∈ [-1,1]，世界空间方向），按到达序入队（FIFO，上限 8）
  - `{t:'ping'}` → `{t:'pong', tick}`
- 下行（10Hz）：
  - `{t:'snapshot', tick, bodies:[{uid, gx, gz, y, rot, vx, vz}]}` —— 权威快照，客户端插值渲染

## 确定性纪律

- 单线程主循环 + 固定步进 1/60（`world.timestep = FIXED_DT`）；
- 每个玩家每 tick 最多消费 1 条输入（FIFO），同输入序列 → 同快照（bit-level，IEEE 754-2008 平台）；
- 升级 rapier 版本前必须跑 `scripts/world-smoke.js` 的确定性抽样（同输入两次运行快照一致）。

## M2 落地修正（与设计文档的差异）

1. **地形碰撞体用 TriMesh 而非 heightfield**：`ColliderDesc.heightfield` 在
   `rapier3d-deterministic-compat@0.20.0` 中创建即 WASM panic（unreachable）。TriMesh 由同一
   65×65 height 场构建（每 cell 2 三角），几何等价、确定性一致；升级 rapier 后应回归换回 heightfield。
2. **恢复 API 用 `SerializationPipeline.deserializeAll`**：本 build 无 `World.restoreSnapshot`；
   二者同源二进制，恢复后需由 Spring Boot 重建玩家/地形/物体索引（handle 全部变化）。
3. **npm 包用 `-deterministic-compat`**（确定性构建 + 内嵌 WASM，Node 免 bundler 直接运行）；
   任务书写的 `@dimforge/rapier3d-deterministic` 为纯 wasm 变体，Node 直接 require 需手搭 wasm 加载。

## 冒烟脚本

- `scripts/world-smoke.js`：world 单元（移动/贴地/快照/恢复/确定性）
- `scripts/service-smoke.js`：协议端到端（spawn → healthz → load_world → WS 输入 → 快照 → snapshot → restore）
- `scripts/trimesh-test.js` / `scripts/hf-isolate.js`：rapier API 探针（heightfield bug 记录）
