-- ============================================================
-- 大世界（WORLD）模块初始化 SQL —— 建表 + 初始数据
-- 数据库：pet_park（utf8mb4 / utf8mb4_unicode_ci）
-- 适用：MySQL 5.7+ / 8（ADR-D8 用户选 MySQL）
-- 用法：mysql -uroot -p pet_park < world_init.sql   （幂等，可重复执行）
-- 风格：对齐现有 schema.sql（全字段 COMMENT、IF NOT EXISTS、InnoDB）
--
-- ⚠️ 重要说明（以【代码实体】为权威，非设计文档）：
--   1. 设计文档 assets/3d_build/docs/world-game/03-db-schema.md（v1.0，2026-08-12）
--      只定义了 world_config/world_chunks/world_objects/terrain_mods 4 张表，
--      且 world_config 缺 7 个地形参数（scale/octaves/lacunarity/gain/slope_walk/slope_build/ore_density）。
--   2. 实际运行代码（pet-park-server .../world/entity/*）还多出
--      world_inventory（M4 采矿背包）与 world_physics_snapshot（v49 物理快照）两张表，
--      且 world_config 实体字段比设计文档多 7 个。本文件以代码为准，否则应用会因字段缺失报错。
--   3. world_chunks 为设计预留（加速重启缓存），当前代码【未使用】（地形实时确定性生成），
--      建表无害、留作后续优化，初始为空。
--   4. world_config 默认数据严格对齐 WorldConfigService.defaultConfig() 回退值，
--      保证「DB 有行」与「空表代码回退」行为一致。若 v49 Voronoi 群岛地形实际使用不同参数，
--      上线前请按 TerrainService 实际取值调整该行。
-- ============================================================


-- ============================================================
-- 1) 世界配置表（全局一行：种子/版本/地形参数）
--    默认值对齐 WorldConfigService.defaultConfig()
-- ============================================================
CREATE TABLE IF NOT EXISTS world_config (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID（恒为1）',
  seed          VARCHAR(32)  NOT NULL DEFAULT 'dudu2019' COMMENT '世界种子（改种子=新世界）',
  version       INT          NOT NULL DEFAULT 1 COMMENT '世界版本（改种子/参数时+1，客户端重载依据）',
  chunk_size    INT          NOT NULL DEFAULT 64 COMMENT 'chunk 边长（世界格）',
  world_radius  INT          NOT NULL DEFAULT 1024 COMMENT '世界半径（chunk 数，0=无限）',
  water_level   DECIMAL(6,2) NOT NULL DEFAULT -5.00 COMMENT '水位线（高度<此值=水）',
  tree_density  DECIMAL(8,5) NOT NULL DEFAULT 0.005 COMMENT '草地区树木密度（0-1）',
  scale         DECIMAL(8,5) NOT NULL DEFAULT 0.00400 COMMENT 'fbm 基础频率',
  octaves       INT          NOT NULL DEFAULT 4 COMMENT 'fbm 倍频',
  lacunarity    DECIMAL(8,3) NOT NULL DEFAULT 2.000 COMMENT 'fbm 频率倍增',
  gain          DECIMAL(8,3) NOT NULL DEFAULT 0.500 COMMENT 'fbm 振幅衰减',
  slope_walk    DECIMAL(6,2) NOT NULL DEFAULT 35.00 COMMENT 'walkable 坡度阈值（°）',
  slope_build   DECIMAL(6,2) NOT NULL DEFAULT 15.00 COMMENT 'buildable 坡度阈值（°）',
  ore_density   DECIMAL(4,2) NOT NULL DEFAULT 0.03 COMMENT 'mountain 区矿脉密度（0-1）',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='世界配置表（种子/版本/地形参数，全局一行）';

-- 幂等初始化：仅当 id=1 不存在时插入默认世界（不覆盖运维后续调整的值）
INSERT IGNORE INTO world_config
  (id, seed, version, chunk_size, world_radius, water_level, tree_density,
   scale, octaves, lacunarity, gain, slope_walk, slope_build, ore_density)
VALUES
  (1, 'dudu2019', 1, 64, 1024, -5.00, 0.005,
   0.00400, 4, 2.000, 0.500, 35.00, 15.00, 0.03);


-- ============================================================
-- 2) 世界对象表（核心：玩家建筑/鱼塘/资源点，只存玩家改动）
--    ext_json 代码中以 String 存储（非 MySQL JSON 类型），故用 TEXT。
--    uk_chunk_cell 含 state：配合 insertIfAbsent 防同 cell 双置（state=1）。
-- ============================================================
CREATE TABLE IF NOT EXISTS world_objects (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT 'chunk 标识：cx_cz（如 12_8）',
  gx          INT          NOT NULL COMMENT '世界格 X（1格=1单位）',
  gz          INT          NOT NULL COMMENT '世界格 Z',
  type        VARCHAR(32)  NOT NULL COMMENT '对象类型：house/shed/fish_pond/...（关联 categories.code）',
  owner_id    BIGINT       NOT NULL COMMENT '所有者用户ID（关联 users.id）',
  rot         DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '朝向（弧度）',
  ext_json    TEXT         DEFAULT NULL COMMENT '附加状态JSON文本（代码以String存储）：{fishType,fishCount,...}',
  state       TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 正常 / 0 拆除（软删，保留记录）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_chunk_cell (chunk_key, gx, gz, state),
  KEY idx_chunk_owner (chunk_key, owner_id),
  KEY idx_owner (owner_id, created_at),
  CONSTRAINT fk_wobj_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='世界对象表（玩家建筑/鱼塘/资源点，只存玩家改动）';


-- ============================================================
-- 3) 地形修改表（挖/填/伐木/挖矿/修路等玩家对地形的改动）
--    old_type/new_type: 语义类型编码（water/sand/grass/mountain/tree/rock/ore_coal/ore_iron/ore_gold/empty）
--    挖矿：old_type='ore_*', new_type='empty'；⚠️ 当前代码【无矿脉再生定时任务】，记录会长期留存。
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='地形修改表（玩家对地形的改动，与生成地形叠加）';


-- ============================================================
-- 4) 世界背包表（玩家世界采集物，M4 采矿使用）
--    uk_owner_item(uid,item_type) 保证每玩家每种物品一行；采集时原子 upsert +1。
--    代码实体字段：id/uid/itemType/qty/createdAt/updatedAt（驼峰转下划线）。
-- ============================================================
CREATE TABLE IF NOT EXISTS world_inventory (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid         BIGINT       NOT NULL COMMENT '玩家（关联 users.id）',
  item_type   VARCHAR(32)  NOT NULL COMMENT '物品类型（=categories.code，如 coal_ore/iron_ore/gold_ore）',
  qty         INT          NOT NULL DEFAULT 0 COMMENT '数量',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_owner_item (uid, item_type),
  KEY idx_uid (uid),
  CONSTRAINT fk_winv_uid FOREIGN KEY (uid) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='世界背包表（玩家世界采集物，M4采矿）';


-- ============================================================
-- 5) 世界物理快照表（v49 物理引擎，ADR-W7 崩溃续跑）
--    snapshot 为 Rapier takeSnapshot() 二进制（Uint8Array）→ LONGBLOB。
--    代码实体字段：id/chunkKey/tick/snapshot/bodyCount/createdAt。
-- ============================================================
CREATE TABLE IF NOT EXISTS world_physics_snapshot (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT '世界分片标识（当前单服恒为 global；预留分片扩容）',
  tick        BIGINT       NOT NULL COMMENT '物理 tick 号（固定步进计数，恢复时对齐）',
  snapshot    LONGBLOB     NOT NULL COMMENT 'Rapier takeSnapshot() 二进制（Uint8Array）',
  body_count  INT          DEFAULT NULL COMMENT '快照内刚体数（诊断/校验）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  KEY idx_chunk (chunk_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='世界物理快照表（physics-service 崩溃续跑，低频覆盖写）';


-- ============================================================
-- 6) 世界 chunk 缓存表（设计预留，当前代码【未使用】）
--    地形确定性可重算，此表仅为性能优化（加速重启）；可随时清空。
-- ============================================================
CREATE TABLE IF NOT EXISTS world_chunks (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key     VARCHAR(24)  NOT NULL COMMENT 'chunk 标识：cx_cz（如 12_8）',
  cx            INT          NOT NULL COMMENT 'chunk X 坐标',
  cz            INT          NOT NULL COMMENT 'chunk Z 坐标',
  height_blob   LONGBLOB     NOT NULL COMMENT '65×65 高度 float32 原始字节（4225×4B）',
  semantic_blob LONGBLOB     NOT NULL COMMENT '64×64 语义 byte 原始字节（4096B）',
  version       INT          NOT NULL DEFAULT 1 COMMENT '世界版本（缓存失效依据）',
  gen_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '生成时间',
  UNIQUE KEY uk_chunk_key (chunk_key, version),
  KEY idx_chunk_xy (cx, cz)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='世界 chunk 缓存表（设计预留，当前代码未使用，地形实时确定性生成）';


-- ============================================================
-- 7) users 表追加字段（大世界位置/会话态）
--    去掉 AFTER 子句以兼容不同 users 表结构；位置是会话态，落库用于重连恢复+全局地图。
-- ============================================================
ALTER TABLE users
  ADD COLUMN pos_x      INT          DEFAULT NULL COMMENT '玩家当前位置 X（世界格）',
  ADD COLUMN pos_z      INT          DEFAULT NULL COMMENT '玩家当前位置 Z（世界格）',
  ADD COLUMN pos_y      DECIMAL(6,2) DEFAULT NULL COMMENT '玩家当前高度 Y',
  ADD COLUMN last_chunk VARCHAR(24)  DEFAULT NULL COMMENT '玩家所在 chunk_key（区域订阅）';
-- 注：MySQL 8 支持 ADD COLUMN IF NOT EXISTS；若用 5.7 重复执行会报 Duplicate column，
--     可改为先 SELECT 判断或手动忽略该错误。


-- ============================================================
-- 8) categories 表扩展（建筑/鱼塘/矿石类型种子）
--    仅定义售价/经验/等级/颜色；矿石是世界生成资源，挖出后入 world_inventory 可卖积分。
-- ============================================================
INSERT INTO categories (code,name,type,price,sell_price,grow_days,feed_days,exp,level_req,product,prod_price,satiety,energy,color,sort_order) VALUES
 ('wood_house','木屋','building',100,0,0,0,0,1,NULL,0,0,0,'#C98A4B',50),
 ('stone_house','石屋','building',300,0,0,0,0,2,NULL,0,0,0,'#8A8A7A',51),
 ('small_pond','小池塘','pond',50,0,0,0,0,1,NULL,0,0,0,'#2F7FD6',60),
 ('coal_ore','煤矿石','resource',0,8,0,0,2,1,NULL,0,0,0,'#555555',70),
 ('iron_ore','铁矿石','resource',0,20,0,0,5,2,NULL,0,0,0,'#B0B0B0',71),
 ('gold_ore','金矿石','resource',0,60,0,0,12,3,NULL,0,0,0,'#FFD700',72)
ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), price=VALUES(price),
                        sell_price=VALUES(sell_price), exp=VALUES(exp), level_req=VALUES(level_req),
                        color=VALUES(color), sort_order=VALUES(sort_order);


-- ============================================================
-- 初始数据小结
--   world_config : 1 行默认世界（seed=dudu2019, version=1, 全套地形参数）
--   world_objects / terrain_mods / world_inventory / world_physics_snapshot / world_chunks : 初始为空（prod 从零开始）
--   用户位置字段 / categories 扩展 : 随业务增长
-- ============================================================
