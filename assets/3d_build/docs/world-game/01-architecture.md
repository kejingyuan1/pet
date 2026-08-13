# 架构设计文档 — 大世界程序化地形（Web 在线·多人·持久化）

> 项目：pet-park（宠物乐园）
> 版本：v1.0 · 2026-08-12
> 状态：设计稿（待评审）
> 关联代码：前端 `pet/pet-park-ng/`（Angular 19）· 后端 `pet/pet-park-server/`（Spring Boot 3.3.5 + MyBatis-Plus + MySQL）

---

## 1. 背景与目标

### 1.1 现状
pet-park 当前是**单玩家存档制**：`users.state_json` 直存完整游戏状态（农场/鱼塘/牧场/房屋/宠物），由前端 app.component.ts 全量管理，后端只做 JSON 存取 + 积分同步。无真实 3D 世界，scene3d 组件加载占位 GLB。

### 1.2 目标
把"单机存档"升级为**大世界、多人共享、持久化**的 Web 在线游戏：

1. **程序化地形**：服务端确定性生成（同种子全球一致），Chunk 流式加载，浏览器按需拉取
2. **语义化地图**：每个世界坐标可查询 `{type: water/sand/grass/mountain/tree, walkable, elevation}` —— 湖里养鱼、平地盖房、树上采集
3. **多人共享**：所有玩家在同一世界，建筑/资源变更实时广播
4. **持久化**：玩家行为（建筑/鱼塘/伐木）落 MySQL，重启不丢
5. **兼容现有**：账号体系、积分、题库、学历沿用；单机存档作为"家宅私有状态"保留

### 1.3 非目标（本阶段）
- 不做物理引擎 / 碰撞体（网格级近似判定足够）
- 不做无缝大地形烘焙贴图（顶点色 + 语义网格着色）
- 不做跨服分片（单服大世界起步，预留分片接口）

---

## 2. 核心设计决策（ADR）

| # | 决策 | 理由 | 备选（否决） |
|---|---|---|---|
| D1 | **确定性程序化地形**（服务端 SimplexNoise，种子固定） | 地形不落库，只存玩家改动 → 数据库只存增量，容量可控；同种子全球一致 | HY3D/AI 生成整图（死资产，无语义）❌ |
| D2 | **Chunk 64×64 寻址 `(chunkX, chunkZ)`** | 粒度平衡：单 chunk 顶点数 ≈ 4k，单次 HTTP 响应 < 100KB | 32 太小（请求频繁）/ 256 太大（加载卡顿） |
| D3 | **语义网格随 chunk 下发**（`semantic[]` 数组） | 客户端判"能养鱼/能盖房"零查询成本 | 客户端本地重算（逻辑重复，易作弊）❌ |
| D4 | **服务端是规则权威**（放置/养鱼校验在服务端） | 防作弊、多玩家一致 | 客户端自由放置（可篡改）❌ |
| D5 | **世界状态全局表，玩家私有态留 state_json** | 世界共享 vs 私有存档分离；沿用现有 version 机制 | 全部进 state_json（大世界必然爆）❌ |
| D6 | **WebSocket（STOMP）做区域广播** | 实时性；区域订阅天然限流 | 轮询 REST（延迟高、浪费）❌ |
| D7 | **坐标 Y-up 整数网格**（`(gx, gz)` 世界格 + 子偏移） | Three.js 默认 Y-up；网格便于语义索引 | 浮点自由坐标（语义查询复杂） |
| D8 | **MySQL（沿用现有）** | 用户已定；MyBatis-Plus + 分区表足够 | PostgreSQL（用户明确选 MySQL）❌ |

---

## 3. 系统架构总览

```
┌─────────────────────────────┐          ┌─────────────────────────────────────┐
│  浏览器 / Angular 19         │          │  pet-park-server (Spring Boot 3.3.5) │
│                             │  REST    │                                     │
│  scene3d.component          │◄────────►│  WorldController (chunk/build/fish)  │
│  ChunkStreamer (缓存LRU)    │  /api/ws │  TerrainService (SimplexNoise)       │
│  SemanticGrid (语义层)      │◄────────►│  WorldStateService (建筑/资源)       │
│  OrbitControls 交互          │  STOMP   │  ChatController                     │
│  GameState(私有存档)        │          │  WebSocketConfig + RegionBroker      │
│                             │          │                                     │
└─────────────────────────────┘          │  ┌───────────────┐  持久化          │
                                         │  │ MyBatis-Plus  │◄───────────────►│ MySQL
                                         │  └───────────────┘                  │
                                         └─────────────────────────────────────┘
```

### 3.1 分层职责

| 层 | 职责 | 关键类（规划） |
|---|---|---|
| Controller | REST 边界、参数校验、DTO 转换 | `WorldController` `AuthController`（沿用） |
| WebSocket | 区域订阅、事件广播、在线玩家管理 | `WebSocketConfig` `RegionBroker` `WorldWsController` |
| Service | 业务规则：地形生成、语义查询、放置校验、状态变更 | `TerrainService` `WorldStateService` `BuildRuleService` `FishService` |
| Mapper | 数据访问（MyBatis-Plus BaseMapper） | `WorldObjectMapper` `WorldChunkMapper` `TerrainModMapper` |
| 前端 | 渲染、流式加载、交互、语义判定 | `ChunkStreamerService` `SemanticGridService` `WorldApiService` |

---

## 4. 世界与坐标体系

### 4.1 坐标系
- **Y-up**（Three.js 默认）：`x` 东，`y` 高，`z` 北
- **世界格**：1 格 = 1 世界单位；地形格（cell）= 1×1 单位
- **Chunk**：64×64 格 = 4096 cell；chunk 原点 = `(chunkX×64, chunkZ×64)`

### 4.2 语义类型（核心）
```ts
type CellType = 'water' | 'sand' | 'grass' | 'mountain' | 'tree' | 'rock';
interface SemanticCell {
  type: CellType;
  elevation: number;   // 地形高度（y）
  walkable: boolean;   // 可否站立/建造
  buildable: boolean;  // 可否盖房（平地+非水+非资源点）
}
```

### 4.3 生成规则（SimplexNoise）
```
h(x,z) = fbm(x,z, octaves=4, lacunarity=2, gain=0.5, scale≈0.01)
water    : h < 0
sand     : 0 ≤ h < 1.2
grass    : 1.2 ≤ h < 8
mountain : h ≥ 8
tree     : grass 上按散点噪声分布（密度 ~2%）
rock     : mountain 边缘随机点
walkable : type ∈ {sand, grass}（mountain 坡度 > 阈值不可走）
buildable: walkable 且非 tree/rock 且 slope < 15°
```
> 种子：`world_config.seed`（表），默认 `dudu2019` 可改，改后整世界重排（版本化）。

---

## 5. Chunk 流式加载

### 5.1 客户端请求策略
```
viewportChunks(players) → 半径 R（默认 3）内 chunk 集合
missing = 集合 - 缓存 - inFlight
并发请求（≤ 8）→ 组装网格 → 渲染
离开 R 的 chunk → 卸载 mesh，缓存语义（LRU 64）
```

### 5.2 响应格式（DTO）
```jsonc
GET /api/world/chunk?cx=12&cz=8&v=1
{
  "cx": 12, "cz": 8,
  "height": [ /* 65×65 高度，float 数组 */ ],
  "semantic": [ /* 64×64 CellType 编码 (byte) */ ],
  "objects": [ /* 该 chunk 内的玩家建筑/资源（DB 查询） */ ]
}
```

### 5.3 版本与失效
- `world_config.version` 变化 → 全客户端强制重载世界
- 建筑放置 → 服务端广播 `OBJECT_ADD {chunkKey, object}` → 该 chunk 内客户端增量插入

---

## 6. 持久化模型（概要，详见 db-schema.md）

| 表 | 说明 | 关键字段 |
|---|---|---|
| `world_config` | 世界配置（种子/版本/尺寸） | `seed, version` |
| `world_chunks` | **可选缓存**（首次生成后落库，减少重算） | `chunk_key PK, height BLOB, semantic BLOB, gen_at` |
| `world_objects` | 玩家建筑/鱼塘/资源点（**只存玩家改动**） | `chunk_key, gx, gz, type, owner_id, state, created_at` |
| `terrain_mods` | 地形修改（挖/填/伐） | `chunk_key, gx, gz, old_type, new_type, by_player, at` |
| `users`（沿用） | + 新增 `pos_x/pos_z/pos_y, chunk_key` | 玩家当前位置 |

> 设计要点：**地形本身不落库**（确定性生成可重算），`world_chunks` 只是性能优化缓存；`world_objects` 才是持久化核心。

---

## 7. 多人同步（WebSocket）

### 7.1 协议（STOMP over WebSocket）
```
订阅：/topic/region.{chunkKey}     # 玩家所在区域广播
发送：/app/ws.position             # 位置心跳 {gx,gz}
发送：/app/ws.build                # 放置请求（服务端校验）
发送：/app/ws.chat                 # 区域聊天
```

### 7.2 事件类型
| 事件 | 载荷 | 说明 |
|---|---|---|
| `POSITION` | `{uid, gx, gz, y, rot}` | 心跳广播（节流 1s） |
| `OBJECT_ADD` | `{chunkKey, object}` | 建筑/鱼塘新增 |
| `OBJECT_REMOVE` | `{chunkKey, objectId}` | 拆除 |
| `OBJECT_UPDATE` | `{chunkKey, objectId, state}` | 生长/状态变更 |
| `TERRAIN_CHANGE` | `{chunkKey, gx, gz, newType}` | 地形修改 |
| `CHAT` | `{uid, nickname, text}` | 区域聊天 |

### 7.3 区域管理
- 服务端维护 `Map<chunkKey, Set<sessionId>>`，玩家心跳时更新所在区域
- 广播仅发给同区域订阅者（跨 chunk 不扩散）

---

## 8. 游戏规则（服务端权威）

### 8.1 放置规则
```
POST /api/world/build {gx, gz, objectType}
服务端校验：
  1. (gx,gz) 在合法世界范围
  2. semantic[gx,gz].buildable == true  （非水/非山/非树/坡度OK）
  3. 目标 cell 未被占用（查 world_objects + terrain_mods）
  4. 玩家权限（金币/等级，按 categories 表配置）
→ 通过：落库 + 广播 OBJECT_ADD；失败：返回错误码
```

### 8.2 养鱼规则
```
POST /api/world/fish {gx, gz, fishType}
校验：
  1. semantic[gx,gz].type == 'water'   ← 只能湖里养鱼
  2. 该 cell 无其他鱼塘
  3. 金币足够（categories.type='fish' 价格）
→ 通过：创建 world_objects(type='fish_pond') + 广播
```

### 8.3 错误码
沿用现有 `Result` 包装 + 业务错误码：`WORLD_NOT_BUILDABLE` `WORLD_CELL_OCCUPIED` `WORLD_NOT_WATER` `WORLD_OUT_OF_BOUNDS` `INSUFFICIENT_COINS` 等。

---

## 9. 与现有系统的集成

### 9.1 复用
- `users` 表 / JWT / 邀请码 / SecurityConfig / GlobalExceptionHandler / Result —— 全部沿用
- `categories` 表 —— 建筑/鱼塘/道具价格配置复用（新增 type 枚举：`building`/`pond`）
- 题库/学历/积分 —— 不影响

### 9.2 私有存档 vs 世界状态
| 数据 | 归属 | 存储 |
|---|---|---|
| 宠物属性/背包/成长 | 玩家私有 | `users.state_json`（沿用） |
| 家宅内布局（furniture） | 玩家私有 | `users.state_json` |
| 公共世界的建筑/鱼塘/资源 | 世界共享 | `world_objects` |
| 玩家当前位置 | 会话态 | 内存 + `users.pos_*` 定时落库 |

> 大世界场景下玩家建筑**不再进 state_json**（否则多人共享无法同步）。

---

## 10. 容量与性能

| 项 | 估算 |
|---|---|
| 世界范围 | 默认 2048×2048 chunk（131072×131072 格），可扩展 |
| 单 chunk 载荷 | height 65×65×4B ≈ 17KB + semantic 64×64B ≈ 4KB + gzip → < 20KB |
| 客户端常驻 | 3×3 chunk ≈ 36k 顶点（低于移动端 100k 上限） |
| 并发 | 单机 Netty 支撑 1k WS 连接无压力；区域广播局部化 |
| DB 压力 | 世界对象写多读少，按 chunk_key 分区索引，单机 MySQL 足够 |

---

## 11. 里程碑（建议）

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1（原型） | TerrainService 生成 + chunk API + 前端流式渲染 + OrbitControls | 浏览器能看到语义着色地形、可缩放 |
| M2（单人玩法） | 放置建筑/养鱼校验 + world_objects 落库 + 私有存档集成 | 湖里养鱼、平地盖房生效且重启保留 |
| M3（多人） | WebSocket 区域广播 + 玩家位置 + 聊天 | 双浏览器同世界互见建筑/位置 |
| M4（打磨） | 地形修改/资源采集/性能优化 | 全流程顺畅 |

---

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| 确定性生成在不同环境 float 误差 | 服务端唯一权威，客户端只渲染服务端下发的 height/semantic |
| 大世界 DB 膨胀 | 地形不落库（只存玩家改动）；world_chunks 缓存可清理 |
| WS 断线重连 | 客户端心跳 + 重连后全量刷新当前区域 |
| 作弊（伪造建筑） | 所有写操作走服务端校验（D4） |
| 前端性能 | LRU chunk 缓存 + 视距内只渲染可见 chunk |
