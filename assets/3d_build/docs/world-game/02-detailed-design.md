# 详细设计文档 — 大世界程序化地形（Chunk 流式加载·语义查询·放置规则）

> 关联架构：`docs/world-game/01-architecture.md`
> 目标代码：pet-park-server（Spring Boot 3.3.5 + MyBatis-Plus）· pet-park-ng（Angular 19 + Three.js）

---

## 1. 模块与类设计（后端）

### 1.1 包结构（`com.petpark` 下新增）

```
com.petpark
├── world
│   ├── controller
│   │   ├── WorldController.java        # REST: chunk / build / fish / terrain
│   │   └── WorldWsController.java      # WS: 位置心跳 / 操作 / 聊天
│   ├── service
│   │   ├── TerrainService.java         # 确定性噪声地形生成（核心）
│   │   ├── ChunkCacheService.java      # chunk 生成结果缓存（内存 LRU + 可选 DB）
│   │   ├── WorldStateService.java      # world_objects 读写 + 广播
│   │   ├── BuildRuleService.java       # 放置/养鱼规则校验（权威）
│   │   └── RegionBroker.java           # chunkKey → sessions 区域管理
│   ├── entity
│   │   ├── WorldConfig.java
│   │   ├── WorldChunk.java             # 可选缓存
│   │   ├── WorldObject.java            # 建筑/鱼塘/资源点
│   │   └── TerrainMod.java
│   ├── mapper
│   │   ├── WorldConfigMapper.java
│   │   ├── WorldChunkMapper.java
│   │   ├── WorldObjectMapper.java
│   │   └── TerrainModMapper.java
│   ├── dto
│   │   ├── ChunkResp.java
│   │   ├── BuildReq.java / BuildResp.java
│   │   ├── FishReq.java / FishResp.java
│   │   └── WsPositionMsg.java / WsObjectMsg.java / WsChatMsg.java
│   └── geo
│       ├── ChunkKey.java               # (cx,cz) → long 编码 / chunkKey 字符串
│       ├── CellType.java               # 枚举 water/sand/grass/mountain/tree/rock/ore_*
│       └── SemanticGrid.java           # 65×65 高度 + 64×64 语义封装
└── config
    └── WebSocketConfig.java            # STOMP endpoint + 权限
```

### 1.2 关键类职责与伪码

#### TerrainService（确定性生成）
```java
@Service
public class TerrainService {
    // 世界配置（种子来自 world_config 表，全局单例加载）
    private final WorldConfig cfg;
    // 2D 噪声场，按 (gx,gz) 采样，float 精度一致（double 计算后 cast）
    private final OpenSimplex2F noise;

    // 生成整个 chunk 的高度 + 语义（纯函数，同参数同结果）
    public ChunkData generate(int cx, int cz) {
        float[] height = new float[65 * 65];   // 顶点高度（含边界点，供跨 chunk 平滑）
        byte[]  semantic = new byte[64 * 64];  // cell 类型
        for (int gz = cz * 64; gz <= cz * 64 + 64; gz++) {
            for (int gx = cx * 64; gx <= cx * 64 + 64; gx++) {
                float h = fbm(gx, gz);          // 四层 fbm
                height[offset(gx, gz)] = h;
                if (gx < cx * 64 + 64 && gz < cz * 64 + 64) {
                    semantic[cellOffset(gx, gz)] = classify(h, gx, gz);
                }
            }
        }
        return new ChunkData(cx, cz, height, semantic);
    }

    private float fbm(int x, int z) { /* octaves=4, lacunarity=2, gain=0.5, scale=0.01 */ }
    private byte classify(float h, int gx, int gz) {
        if (h < 0) return WATER;
        if (h < 1.2f) return SAND;
        if (h >= 8f) {
            // mountain 区按 ore 噪声场撒矿（密度 3%），越深处矿级越高
            float o = oreNoise(gx, gz);
            if (o > 0.97f) return ORE_GOLD;
            if (o > 0.94f) return ORE_IRON;
            if (o > 0.90f) return ORE_COAL;
            return MOUNTAIN;
        }
        // grass 区散点树（第二个噪声场，密度 2%）
        if (treeNoise(gx, gz) > 0.98f) return TREE;
        return GRASS;
    }
}
```

#### BuildRuleService（放置权威校验）
```java
@Service
public class BuildRuleService {
    public BuildResp validate(Long uid, int gx, int gz, String objectType) {
        // 1. 边界
        if (!inWorld(gx, gz)) return fail(WORLD_OUT_OF_BOUNDS);
        // 2. 语义：只能放 buildable cell（grass/sand + 坡度OK + 非tree/rock）
        CellType t = terrain.semanticAt(gx, gz);
        if (t != GRASS && t != SAND) return fail(WORLD_NOT_BUILDABLE);
        // 3. 占用：查 world_objects（该 cell 无其他对象）
        if (worldState.exists(gx, gz)) return fail(WORLD_CELL_OCCUPIED);
        // 4. 权限：categories.price vs users.coins（沿用积分）
        ...
    }
}
```

#### RegionBroker（区域广播）
```java
@Component
public class RegionBroker {
    // chunkKey("cx_cz") → 订阅者 sessionId 集合
    private final ConcurrentHashMap<String, Set<String>> regions = new ConcurrentHashMap<>();

    public void join(String sessionId, String chunkKey) { /* 移出旧区域，加入新区域 */ }
    public void broadcast(String chunkKey, Object payload) { /* 发给该区域所有 session */ }
}
```

---

## 2. API 详细设计（REST）

### 2.1 统一约定
- 前缀 `/api/world`，返回包装 `Result<T>`（沿用现有 `Result` 类）
- 认证：`Authorization: Bearer <JWT>`（沿用 `JwtAuthFilter`）
- 参数：世界坐标为整数 `(gx, gz)`；chunk 坐标为 `(cx, cz)`

### 2.2 接口清单

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/api/world/config` | - | 返回世界配置（seed/version/边界），客户端初始化 |
| GET | `/api/world/chunk?cx=&cz=` | cx, cz | 返回该 chunk 的 height + semantic + objects |
| POST | `/api/world/build` | `{gx, gz, objectType, rot?}` | 放置建筑（服务端校验+落库+广播） |
| DELETE | `/api/world/build/{objectId}` | - | 拆除建筑（owner 或 admin） |
| POST | `/api/world/fish` | `{gx, gz, fishType}` | 湖中养鱼（校验 water cell） |
| POST | `/api/world/terrain` | `{gx, gz, action}` | 地形修改（fill/dig/chop） |
| GET | `/api/world/objects?cx=&cz=` | cx, cz | 单独拉某 chunk 的对象（增量刷新用） |

### 2.3 ChunkResp 示例
```jsonc
{
  "code": 0,
  "data": {
    "cx": 12, "cz": 8,
    "version": 3,                    // 世界版本（变化则客户端重载）
    "height": [/* 4225 floats (65*65), base64 */],
    "semantic": [/* 4096 bytes, base64 */],
    "objects": [
      { "id": 1001, "type": "house", "gx": 780, "gz": 524, "rot": 1.57,
        "owner": {"uid": 3, "nickname": "小明"}, "state": {} }
    ]
  }
}
```

---

## 3. WebSocket 协议

### 3.1 配置
```yaml
# application.yml 追加
spring:
  websocket:
    allowed-origins: ${CORS_ORIGINS:http://localhost:4200,http://localhost:8899}
```
- Endpoint: `/ws`（SockJS fallback 可选）
- STOMP 前缀：应用 `/app`，广播 `/topic`
- 认证：连接时携带 JWT（`Authorization` header 或 `?token=` 查询参数），握手拦截器校验

### 3.2 消息路由

| 方向 | 目的地 | 消息体 | 说明 |
|---|---|---|---|
| 上行 | `/app/ws.position` | `{gx, gz, y, rot}` | 位置心跳（节流 1s/人） |
| 上行 | `/app/ws.build` | `{gx, gz, objectType}` | 同 REST，走服务端校验 |
| 上行 | `/app/ws.chat` | `{text}` | 区域聊天（长度≤200） |
| 下行 | `/topic/region.{chunkKey}` | 事件对象 | 见下方事件模型 |
| 下行 | `/topic/players` | `{uid, nickname, gx, gz, rot}` | 同区域玩家快照/更新 |

### 3.3 事件模型（下行 payload）
```jsonc
// OBJECT_ADD（建筑/鱼塘新增）
{ "t": "OBJECT_ADD", "chunkKey": "12_8", "object": { "id": 1001, "type": "house", "gx": 780, "gz": 524, "rot": 1.57, "owner": {...} } }

// OBJECT_REMOVE / OBJECT_UPDATE / TERRAIN_CHANGE / CHAT / PLAYER_JOIN / PLAYER_LEAVE
```

### 3.4 心跳与断线
- 客户端 5s 心跳（`/app/ws.ping`）；30s 无心跳 → 服务端剔除 + 广播 `PLAYER_LEAVE`
- 断线重连：客户端重连后重新 `join` 区域，服务端推送 `POSITION_SNAPSHOT`（同区域玩家） + 当前 chunk 对象全量

---

## 4. 前端设计（Angular 19 + Three.js）

### 4.1 新增服务

| 服务 | 职责 |
|---|---|
| `WorldApiService` | REST 调用（config/chunk/build/fish/terrain） |
| `ChunkStreamerService` | chunk 请求队列（≤8 并发）、LRU 缓存（64 chunk）、视距计算 |
| `SemanticGridService` | 维护已加载 chunk 的语义网格，提供 `query(gx,gz)` 命中语义 |
| `WorldSocketService` | STOMP 连接、区域订阅、事件分发（EventEmitter） |
| `PlayerManagerService` | 本机玩家 + 远处玩家实例管理（移动插值） |

### 4.2 scene3d.component 改造
```
改造前：加载单个 GLB 占位
改造后：
  1. 初始化：fetch config → 创建 WorldSocketService 连接 → 订阅区域
  2. 每帧：算相机所在 chunk → 请求缺失 chunk → 构建 Mesh（BoxGeometry 合并/顶点色语义着色）
  3. 交互：Raycaster 拾取 (gx,gz) → SemanticGridService.query → 显示"可建造/水面"提示 → 调 API
  4. 对象渲染：chunk 内 objects → 实例化 GLB（Quaternius 建筑/鱼塘）→ 订阅 OBJECT_ADD/REMOVE 增量更新
```

### 4.3 语义着色（调试/玩法可视化）
```ts
const COLOR: Record<CellType, number> = {
  water: 0x2f7fd6, sand: 0xd2b27a, grass: 0x6abf4b,
  mountain: 0x8a8a7a, tree: 0x2d6a2f, rock: 0x9a9a92
};
```
- 玩法默认显示草地/水自然色；调试模式可高亮 `buildable` 格子

### 4.4 放置交互流程
```
点击 → Raycaster → (gx,gz)
→ SemanticGridService.query(gx,gz)
→ 前端先行预览（绿=可建/蓝=水面/红=不可）
→ 用户确认 → WorldApiService.build / fish
→ 服务端 Result 返回：成功→本地插入 + 等广播；失败→toast 错误码
```

---

## 5. 语义网格实现细节

### 5.1 存储与访问
```java
public class SemanticGrid {
    private final int cx, cz;
    private final float[] height;    // 65×65，顶点
    private final byte[] semantic;   // 64×64，cell

    public CellType cellAt(int gx, int gz) {
        return CellType.of(semantic[(gz % 64) * 64 + (gx % 64)]);
    }
    public float heightAt(int gx, int gz) {
        return height[(gz % 64) * 65 + (gx % 64)];
    }
}
```

### 5.2 坡度计算（buildable 判定）
```java
// 取 cell 四周顶点高度差，斜率 < 15° 视为平坦
float slope = max(|h(gx,gz)-h(gx+1,gz)|, |h(gx,gz)-h(gx,gz+1)|) / 1.0f;
boolean buildable = walkable && slope < tan(15°);
```

### 5.3 跨 chunk 一致性
- 高度数组取 65×65（含右/上边界点），相邻 chunk 共享边界列/行 → 渲染无缝
- 语义只 64×64（cell 中心点判定），cell 归属 chunk 唯一 → 无重复

---

## 6. 规则校验细节（防作弊）

### 6.1 放置建筑
```java
// 服务端唯一入口（REST 和 WS 共用同一 service 方法）
public Result<Long> placeBuild(Long uid, int gx, int gz, String type) {
    if (!geo.inWorld(gx, gz)) return Result.fail(WORLD_OUT_OF_BOUNDS);
    if (!terrain.isBuildable(gx, gz)) return Result.fail(WORLD_NOT_BUILDABLE);
    if (worldState.exists(gx, gz)) return Result.fail(WORLD_CELL_OCCUPIED);
    Category cat = categoryMapper.selectByCode(type);        // categories 表
    if (cat == null || !"building".equals(cat.getType())) return Result.fail(BAD_OBJECT_TYPE);
    if (coins(uid) < cat.getPrice()) return Result.fail(INSUFFICIENT_COINS);
    // 扣款 + 落库 + 广播（同一事务）
    return tx(() -> {
        userService.updateCoins(uid, -cat.getPrice());
        WorldObject obj = worldObjectMapper.insert(new WorldObject(gx, gz, type, uid));
        regionBroker.broadcast(chunkKey(gx, gz), wsObjectAdd(obj));
        return Result.ok(obj.getId());
    });
}
```

### 6.2 养鱼
```java
public Result<Long> stockFish(Long uid, int gx, int gz, String fishType) {
    if (!geo.inWorld(gx, gz)) return Result.fail(WORLD_OUT_OF_BOUNDS);
    if (terrain.cellAt(gx, gz) != WATER) return Result.fail(WORLD_NOT_WATER);  // ★ 只能湖里
    if (worldState.exists(gx, gz)) return Result.fail(WORLD_CELL_OCCUPIED);
    Category cat = categoryMapper.selectByCode(fishType);
    if (cat == null || !"fish".equals(cat.getType())) return Result.fail(BAD_OBJECT_TYPE);
    // 扣款 + 建鱼塘对象（type='fish_pond', ext=fishType）+ 广播
}
```

### 6.3 挖矿（矿脉采集）
```java
public Result<Map<String,Object>> mine(Long uid, int gx, int gz) {
    if (!geo.inWorld(gx, gz)) return Result.fail(WORLD_OUT_OF_BOUNDS);
    CellType t = terrain.cellAt(gx, gz);
    if (!t.isOre()) return Result.fail(WORLD_NOT_ORE);        // ★ 只能挖矿 cell
    if (worldState.oreMined(gx, gz)) return Result.fail(WORLD_ORE_DEPLETED); // 已挖空
    // 冷却/体力校验（可选：体力上限、挖矿次数限流）
    if (energy(uid) < MINE_ENERGY_COST) return Result.fail(INSUFFICIENT_ENERGY);
    // 掉落：矿石产量 = 基础量 + 等级加成（categories 配置）
    int qty = rollOreQty(t);                                    // 伪随机，按玩家等级加权
    // 原子抢占：UPDATE world_objects SET state=2 WHERE cell & state=1 —— 防多人抢同一矿
    boolean won = worldState.tryMine(gx, gz);                   // 乐观锁
    if (!won) return Result.fail(WORLD_ORE_DEPLETED);
    // 落库：terrain_mods 记 ore→empty；背包加矿石；广播 RESOURCE_DEPLETED
    tx(() -> {
        terrainModMapper.upsert(new TerrainMod(gx, gz, t.name(), "empty", uid));
        playerBagService.addOre(uid, t, qty);
        regionBroker.broadcast(chunkKey(gx, gz), wsResourceDepleted(gx, gz, t));
    });
    return Result.ok(Map.of("ore", t.name(), "qty", qty));
}
```

**矿脉再生（服务端定时任务）**：
```java
@Scheduled(cron = "0 */30 * * * *")   // 每 30 分钟
public void regenerateOre() {
    // 扫描 terrain_mods 中 type in (ore_*→empty) 的记录
    // 若挖空时长 > 再生周期（如 24h）→ 删除 mod 记录 = 该 cell 恢复生成语义（ore）
    // 广播 RESOURCE_REGENERATED 给相关区域
}
```
> 再生策略：挖空后 N 小时恢复（`terrain_mods` 删除即回落到生成语义）；黄金矿再生更慢（如 72h）。

### 6.4 客户端校验仅为 UX（非权威）
- 客户端 SemanticGridService 提供即时反馈；**最终结果以服务端 Result 为准**

---

## 7. 缓存与性能

### 7.1 chunk 缓存
```java
// 内存 LRU（Caffeine）：最近 512 chunk
Cache<String, ChunkData> chunkCache = Caffeine.newBuilder()
    .maximumSize(512).expireAfterWrite(10, TimeUnit.MINUTES).build();
// 可选 DB 缓存（world_chunks）：首次生成后落库，重启不重算
```
- 命中：直接返回；未命中：`generate(cx,cz)` → 缓存 → 返回

### 7.2 对象查询
- `world_objects` 以 `(chunk_key, gx, gz)` 联合索引；单 chunk 对象量小（<100），内存过滤足够

### 7.3 前端
- 加载视距 R=3（约 36k 顶点），OrbitControls 缩放影响 R（zoom out 可降 LOD 或禁用远处细节）
- 纹理：语义顶点色（无贴图）→ 零纹理带宽

---

## 8. 配置项（application.yml 追加）
```yaml
petpark:
  world:
    seed: ${WORLD_SEED:dudu2019}        # 世界种子
    version: 1                           # 世界版本（改种子时 +1）
    chunk-size: 64                       # chunk 边长（格）
    world-radius: 1024                   # 世界半径（chunk 数），0=无限
    view-radius: 3                       # 客户端默认视距（chunk）
    tree-density: 0.02                   # 草地区树木密度
  ws:
    heartbeat-ms: 5000                   # 心跳间隔
    idle-timeout-ms: 30000               # 空闲剔除
```
