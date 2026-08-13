# 表设计文档 — 大世界程序化地形（MySQL 5.7+/8）

> 关联架构：`docs/world-game/01-architecture.md` · 详细设计：`02-detailed-design.md`
> 数据库：`pet_park`（沿用现有库，utf8mb4 / utf8mb4_unicode_ci）
> 风格对齐：现有 `schema.sql`（全字段 COMMENT、幂等保护、InnoDB）

---

## 1. 设计原则

1. **地形本身不落库**：确定性程序化生成（种子可重算），DB 只存**玩家产生的增量**（建筑/鱼塘/地形修改）
2. **世界共享 vs 玩家私有分离**：
   - 世界级对象（公共建筑/鱼塘/资源）→ 新表 `world_objects` / `terrain_mods`
   - 玩家私有状态（宠物/背包/家宅布局）→ 沿用 `users.state_json`
3. **性能**：所有世界查询走 `chunk_key` 前缀索引；世界对象按 chunk 拉取，单 chunk 数据量小
4. **幂等**：建表 `IF NOT EXISTS`；种子数据 `ON DUPLICATE KEY UPDATE`（对齐现有风格）

---

## 2. 新增表总览

| 表名 | 用途 | 写入频率 | 数据量级 |
|---|---|---|---|
| `world_config` | 世界配置（种子/版本/边界） | 几乎不写 | 1 行 |
| `world_chunks` | chunk 生成缓存（可选，加速重启） | 首次生成写 | 随探索增长，可清理 |
| `world_objects` | 玩家建筑/鱼塘/资源点（核心） | 中 | 随玩家增长 |
| `terrain_mods` | 地形修改记录（挖/填/伐） | 低 | 随玩法增长 |

---

## 3. 建表 SQL

```sql
-- ============================================================
-- 大世界模块表（追加到 schema.sql 末尾）
-- 用法：mysql -uroot -p < schema.sql（幂等，可重复执行）
-- ============================================================

-- ------------------------------------------------------------
-- 世界配置表（全局一行：种子/版本/边界）
-- 种子决定全球地形；version 变更 → 客户端强制重载世界
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_config (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID（恒为1）',
  seed          VARCHAR(32)  NOT NULL DEFAULT 'dudu2019' COMMENT '世界种子（改种子=新世界）',
  version       INT          NOT NULL DEFAULT 1 COMMENT '世界版本（改种子时+1，客户端重载依据）',
  chunk_size    INT          NOT NULL DEFAULT 64 COMMENT 'chunk 边长（世界格）',
  world_radius  INT          NOT NULL DEFAULT 1024 COMMENT '世界半径（chunk 数，0=无限）',
  water_level   DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT '水位线（高度<此值=水）',
  tree_density  DECIMAL(4,2) NOT NULL DEFAULT 0.02 COMMENT '草地区树木密度（0-1）',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界配置表（种子/版本/边界，全局一行）';

-- 幂等保护：仅当表空时插入默认行
INSERT INTO world_config (id, seed) VALUES (1, 'dudu2019')
ON DUPLICATE KEY UPDATE id = id;

-- ------------------------------------------------------------
-- 世界 chunk 缓存表（可选：首次生成后落库，重启免重算）
-- height: 65×65 高度（float32 原始字节）；semantic: 64×64 语义（byte 原始字节）
-- 说明：地形本可确定性重算，此表仅为性能优化；可随时清空
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_chunks (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT 'chunk 标识：cx_cz（如 12_8）',
  cx          INT          NOT NULL COMMENT 'chunk X 坐标',
  cz          INT          NOT NULL COMMENT 'chunk Z 坐标',
  height_blob LONGBLOB     NOT NULL COMMENT '65×65 高度 float32 原始字节（4225×4B）',
  semantic_blob LONGBLOB   NOT NULL COMMENT '64×64 语义 byte 原始字节（4096B）',
  version     INT          NOT NULL DEFAULT 1 COMMENT '世界版本（缓存失效依据）',
  gen_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '生成时间',
  UNIQUE KEY uk_chunk_key (chunk_key, version),
  KEY idx_chunk_xy (cx, cz)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界 chunk 缓存表（地形生成结果缓存，可清理）';

-- ------------------------------------------------------------
-- 世界对象表（核心：玩家建筑/鱼塘/资源点）
-- ★ 只存玩家产生的内容；地形本身不在此表
-- ext_json: 附加状态（鱼塘的鱼种/数量、建筑等级、生长进度等）
-- 挖矿说明：矿 cell 本身是生成语义（ore_*），不落此表；
--           挖空状态记 terrain_mods（ore_*→empty）；本表不建矿点行
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS world_objects (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT 'chunk 标识：cx_cz（查询索引）',
  gx          INT          NOT NULL COMMENT '世界格 X（1格=1单位）',
  gz          INT          NOT NULL COMMENT '世界格 Z',
  type        VARCHAR(32)  NOT NULL COMMENT '对象类型：house/shed/fish_pond/tree_planted/rock_mined...（关联 categories.code）',
  owner_id    BIGINT       NOT NULL COMMENT '所有者用户ID（关联 users.id）',
  rot         DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '朝向（弧度）',
  ext_json    JSON         DEFAULT NULL COMMENT '附加状态：{fishType, fishCount, level, growDays...}',
  state       TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 正常 / 0 拆除（软删，保留记录）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_chunk_cell (chunk_key, gx, gz, state),
  KEY idx_chunk_owner (chunk_key, owner_id),
  KEY idx_owner (owner_id, created_at),
  CONSTRAINT fk_wobj_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界对象表（玩家建筑/鱼塘/资源点，只存玩家改动）';

-- ------------------------------------------------------------
-- 地形修改表（挖/填/伐木/挖矿/修路等玩家对地形的改动）
-- old_type/new_type: 语义类型编码（water/sand/grass/mountain/tree/rock/ore_coal/ore_iron/ore_gold/empty）
-- 挖矿：old_type='ore_iron', new_type='empty'；定时任务删除记录 → 矿 cell 恢复生成语义（再生）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS terrain_mods (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT 'chunk 标识：cx_cz',
  gx          INT          NOT NULL COMMENT '世界格 X',
  gz          INT          NOT NULL COMMENT '世界格 Z',
  old_type    VARCHAR(16)  NOT NULL COMMENT '原语义类型',
  new_type    VARCHAR(16)  NOT NULL COMMENT '新语义类型',
  by_player   BIGINT       NOT NULL COMMENT '操作玩家（关联 users.id）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  UNIQUE KEY uk_cell (chunk_key, gx, gz),
  KEY idx_mod_owner (by_player, created_at),
  CONSTRAINT fk_tmod_player FOREIGN KEY (by_player) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地形修改表（玩家对地形的改动，与生成地形叠加）';
```

---

## 4. 现有表变更

### 4.1 `users` 表追加字段（大世界位置）

```sql
ALTER TABLE users
  ADD COLUMN pos_x      INT          DEFAULT NULL COMMENT '玩家当前位置 X（世界格）' AFTER version,
  ADD COLUMN pos_z      INT          DEFAULT NULL COMMENT '玩家当前位置 Z（世界格）' AFTER pos_x,
  ADD COLUMN pos_y      DECIMAL(6,2) DEFAULT NULL COMMENT '玩家当前高度 Y' AFTER pos_z,
  ADD COLUMN last_chunk VARCHAR(24)  DEFAULT NULL COMMENT '玩家所在 chunk_key（区域订阅）' AFTER pos_y;
```

> 位置是**会话态**：WS 心跳更新内存，`last_chunk` 定期/登出落库；`pos_*` 仅用于重连恢复 + 全局地图展示。

### 4.2 `categories` 表扩展（建筑/鱼塘/矿石类型）

- `type` 枚举追加：`building`（建筑）、`pond`（鱼塘——注意现有 fish 是"鱼种"，pond 是"鱼塘设施"）、`resource`（矿石等可采集资源，可售卖换积分）
- 建筑/鱼塘/矿石种子示例（追加到 `schema.sql` 的 categories INSERT）：
```sql
INSERT INTO categories (code,name,type,price,sell_price,grow_days,feed_days,exp,level_req,product,prod_price,satiety,energy,color,sort_order) VALUES
 ('wood_house','木屋','building',100,0,0,0,0,1,NULL,0,0,0,'#C98A4B',50),
 ('stone_house','石屋','building',300,0,0,0,0,2,NULL,0,0,0,'#8A8A7A',51),
 ('small_pond','小池塘','pond',50,0,0,0,0,1,NULL,0,0,0,'#2F7FD6',60),
 ('coal_ore','煤矿石','resource',0,8,0,0,2,1,NULL,0,0,0,'#555555',70),
 ('iron_ore','铁矿石','resource',0,20,0,0,5,2,NULL,0,0,0,'#B0B0B0',71),
 ('gold_ore','金矿石','resource',0,60,0,0,12,3,NULL,0,0,0,'#FFD700',72)
ON DUPLICATE KEY UPDATE name=VALUES(name);
```

> 矿石是**世界生成资源**（`semantic[gx,gz].type ∈ {ore_coal, ore_iron, ore_gold}`），不占 `world_objects` 的购买流程；`categories` 里的 `resource` 记录仅定义**售价/经验/等级**，挖出后入玩家背包可卖积分。

---

## 5. 查询示例（按 chunk 拉取对象）

```sql
-- 客户端进入 chunk (12,8) 时拉取该区域所有玩家对象
SELECT o.id, o.gx, o.gz, o.type, o.rot, o.ext_json,
       u.id AS owner_uid, u.nickname AS owner_nick
FROM world_objects o
JOIN users u ON u.id = o.owner_id
WHERE o.chunk_key = '12_8' AND o.state = 1;

-- 放置校验：目标 cell 是否已被占用
SELECT COUNT(*) FROM world_objects
WHERE chunk_key = CONCAT(?, '_', ?) AND gx = ? AND gz = ? AND state = 1;

-- 地形修改叠加：取 cell 当前实际类型（生成类型 + 玩家改动）
SELECT m.new_type FROM terrain_mods m
WHERE m.chunk_key = '12_8' AND m.gx = ? AND m.gz = ?;
-- 若无记录 → 用生成语义；有记录 → new_type 覆盖

-- 挖矿：查目标 cell 是否已被挖空（ore_* → empty）
SELECT COUNT(*) FROM terrain_mods
WHERE chunk_key = CONCAT(?, '_', ?) AND gx = ? AND gz = ?
  AND old_type LIKE 'ore_%' AND new_type = 'empty';

-- 矿脉再生：找出已挖空超过再生周期的矿（定时任务执行）
SELECT m.*, u.nickname FROM terrain_mods m
JOIN users u ON u.id = m.by_player
WHERE m.new_type = 'empty' AND m.old_type LIKE 'ore_%'
  AND m.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR);  -- 煤/铁 24h；金矿 72h
```

---

## 6. 数据一致性约定

1. **世界对象软删**：`state=0` 保留记录（可追溯/回滚），查询默认过滤 `state=1`
2. **地形修改唯一性**：`uk_cell (chunk_key, gx, gz)` —— 同 cell 只保留最新修改（UPDATE 而非 INSERT）
3. **chunk 缓存失效**：`world_chunks` 按 `version` 区分；`world_config.version` 变更 → 旧缓存标记失效/清空
4. **扣款与建物同事务**：`world_objects` 插入 + `users.coins` 扣减在同一事务（`@Transactional`），防中途失败不一致
5. **外键**：`owner_id` / `by_player` 均引用 `users(id)`，保持引用完整性（对齐现有 logs 表风格）

---

## 7. 索引与容量评估

| 表 | 索引 | 服务查询 |
|---|---|---|
| `world_objects` | `uk_chunk_cell (chunk_key,gx,gz,state)` | 放置校验（占用检查） |
| | `idx_chunk_owner (chunk_key,owner_id)` | 按 chunk 拉取 + 按人过滤 |
| | `idx_owner (owner_id,created_at)` | 我的建筑列表 |
| `terrain_mods` | `uk_cell (chunk_key,gx,gz)` | 单 cell 修改查询 |
| `world_chunks` | `uk_chunk_key (chunk_key,version)` | chunk 缓存读写 |

- 单 chunk 对象量：< 100 行（64×64=4096 cell，密度低）
- 10 万玩家 × 每人 10 对象 = 100 万行：`world_objects` 用 `chunk_key` 前缀索引 + 可按 `(chunk_key)` 分区（后期）
- 大世界对象增长可接受：单机 MySQL 千万级无压力（对齐 a2so-plus 分区经验，必要时按 chunk_key 做 RANGE/HASH 分区）

---

## 8. 与现有 schema.sql 的集成方式

- **新建表**：追加到 `schema.sql` 末尾（含幂等保护），Docker 初始化自动执行
- **users 扩展字段**：放 `update.sql`（增量升级，幂等：`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，MySQL 8 支持）
- **categories 种子**：追加 INSERT（`ON DUPLICATE KEY UPDATE` 幂等）
- 保持现有 `schema.sql` 结构不动（老环境兼容），新表集中新增
