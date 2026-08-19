-- ============================================================
-- 我的宠物乐园 · 数据库增量升级脚本（v48 → 当前 / v52）
-- ============================================================
-- 适用对象：已按 v48 部署的「现有生产库」（库名 pet_park，仅 4 张核心表
--           users / logs / categories / questions + education 列）。
-- 作用范围：v48 之后的全部结构增量（v49 大世界模块、v50 玩家位置持久化、
--           v52 牧场拥有动物、登录 500 修复的 gender 列）。
-- 特性：★ 幂等、可重复执行；★ 仅新增表/列/种子，绝不改动已有业务数据；
--        ★ 不执行 DELETE，可安全跑在正在使用的生产库上。
-- 用法：
--   mysql -uroot -p'<DB_PASSWORD>' --default-character-set=utf8mb4 pet_park < UPDATE.SQL
--   （密码走 .env / 命令行参数，切勿把明文密码写进脚本或提交仓库）
-- ============================================================

USE pet_park;

-- ============================================================
-- 一、users 表新增列（大世界位置 + 采矿系统 + 性别建模）
-- MySQL 5.7 无 ADD COLUMN IF NOT EXISTS，用 information_schema 守卫，
-- 重复执行不报错；不放 AFTER 子句，避免依赖既有列顺序。
-- ============================================================
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='pos_x');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN pos_x INT DEFAULT NULL COMMENT ''玩家当前位置 X（世界格）''', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='pos_z');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN pos_z INT DEFAULT NULL COMMENT ''玩家当前位置 Z（世界格）''', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='pos_y');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN pos_y DECIMAL(6,2) DEFAULT NULL COMMENT ''玩家当前高度 Y''', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='last_chunk');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN last_chunk VARCHAR(24) DEFAULT NULL COMMENT ''玩家所在 chunk_key（区域订阅）''', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='energy');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN energy INT NOT NULL DEFAULT 100 COMMENT ''采矿能量（当前值）''', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='level');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN level INT NOT NULL DEFAULT 1 COMMENT ''世界等级（采矿）''', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='experience');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN experience BIGINT NOT NULL DEFAULT 0 COMMENT ''世界经验（累积，采矿）''', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='energy_updated_at');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN energy_updated_at DATETIME DEFAULT NULL COMMENT ''采矿能量最后再生时间戳（懒再生基准）''', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- 🔴 登录 500 修复：gender 列在 User 实体/LoginResp 已引用，但 v48 的 CREATE
--    与 ALTER 均未包含 → 每次登录 SELECT gender 报 Unknown column → 500。
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='pet_park' AND table_name='users' AND column_name='gender');
SET @ddl = IF(@col = 0, 'ALTER TABLE users ADD COLUMN gender VARCHAR(8) DEFAULT NULL COMMENT ''性别：M 男 / F 女（决定男孩/女孩建模）''', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ============================================================
-- 二、新增表（全部 CREATE TABLE IF NOT EXISTS，幂等）
-- ============================================================

-- 错题本（AI 答疑 + 查缺补漏）
CREATE TABLE IF NOT EXISTS question_failures (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  user_id      BIGINT       NOT NULL COMMENT '用户ID',
  question_id  BIGINT       NOT NULL COMMENT '题目ID（questions.id）',
  prompt       TEXT         NOT NULL COMMENT '题目题干快照',
  user_answer  TEXT         NULL COMMENT '用户答错的答案',
  ai_explain   TEXT         NULL COMMENT 'AI 答疑内容',
  weak_points  VARCHAR(255) NULL COMMENT '缺失知识点（逗号分隔）',
  status       TINYINT      NOT NULL DEFAULT 0 COMMENT '状态：0 待学习 / 1 已掌握',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_fail_user (user_id, status, created_at),
  KEY idx_fail_ques (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 世界配置表（种子/版本/边界/生成参数，全局一行）
CREATE TABLE IF NOT EXISTS world_config (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID（恒为1）',
  seed          VARCHAR(32)  NOT NULL DEFAULT 'dudu2019' COMMENT '世界种子（改种子=新世界）',
  version       INT          NOT NULL DEFAULT 1 COMMENT '世界版本（改种子/地形参数时+1）',
  chunk_size    INT          NOT NULL DEFAULT 64 COMMENT 'chunk 边长（世界格）',
  world_radius  INT          NOT NULL DEFAULT 1024 COMMENT '世界半径（chunk 数，0=无限）',
  water_level   DECIMAL(6,2) NOT NULL DEFAULT -2.00 COMMENT '水位线（h<此值=水）',
  tree_density  DECIMAL(4,2) NOT NULL DEFAULT 0.02 COMMENT '草地区树木密度（0-1）',
  scale         DECIMAL(8,5) NOT NULL DEFAULT 0.00400 COMMENT 'fbm 基础频率',
  octaves       INT          NOT NULL DEFAULT 4 COMMENT 'fbm 倍频',
  lacunarity    DECIMAL(6,3) NOT NULL DEFAULT 2.000 COMMENT 'fbm 频率倍增',
  gain          DECIMAL(6,3) NOT NULL DEFAULT 0.500 COMMENT 'fbm 振幅衰减',
  slope_walk    DECIMAL(5,2) NOT NULL DEFAULT 35.00 COMMENT 'walkable 坡度阈值（°）',
  slope_build   DECIMAL(5,2) NOT NULL DEFAULT 15.00 COMMENT 'buildable 坡度阈值（°）',
  ore_density   DECIMAL(4,2) NOT NULL DEFAULT 0.03 COMMENT 'mountain 区矿脉密度（0-1）',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界配置表（种子/版本/边界/生成参数，全局一行）';

-- 仅当表空时插入默认行（幂等）
INSERT INTO world_config (id, seed) VALUES (1, 'dudu2019')
ON DUPLICATE KEY UPDATE id = id;

-- 世界 chunk 缓存表（地形生成结果缓存，可清理）
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界 chunk 缓存表（地形生成结果缓存，可清理）';

-- 世界对象表（玩家建筑/鱼塘/资源点；只存玩家改动）
CREATE TABLE IF NOT EXISTS world_objects (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT 'chunk 标识：cx_cz（查询索引）',
  gx          INT          NOT NULL COMMENT '世界格 X（1格=1单位）',
  gz          INT          NOT NULL COMMENT '世界格 Z',
  type        VARCHAR(32)  NOT NULL COMMENT '对象类型：wood_house/stone_house/fish_pond...（关联 categories.code）',
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

-- 地形修改表（挖/填/伐木/挖矿等玩家对地形的改动）
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
  KEY idx_regen (new_type, created_at),
  KEY idx_regen2 (old_type, new_type, created_at),
  CONSTRAINT fk_tmod_player FOREIGN KEY (by_player) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='地形修改表（玩家对地形的改动，与生成地形叠加）';

-- 世界背包表（玩家世界采集物，采矿出售换积分）
CREATE TABLE IF NOT EXISTS world_inventory (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid         BIGINT       NOT NULL COMMENT '玩家（关联 users.id）',
  item_type   VARCHAR(32)  NOT NULL COMMENT '物品类型（=categories.code，如 coal_ore/iron_ore/gold_ore）',
  qty         INT          NOT NULL DEFAULT 0 COMMENT '数量',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_owner_item (uid, item_type),
  KEY idx_owner (uid, created_at),
  CONSTRAINT fk_winv_owner FOREIGN KEY (uid) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界背包表（玩家世界采集物，M4 出售换积分）';

-- 世界宠物表（玩家成熟动物牵入世界的跟随宠物，无物理）
CREATE TABLE IF NOT EXISTS world_pets (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  uid         BIGINT       NOT NULL COMMENT '主人（关联 users.id）',
  species     VARCHAR(32)  NOT NULL COMMENT '物种（cat/dog/cow/chicken/duck/sheep/fish…）',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT '所在 chunk（查询索引）',
  gx          INT          NOT NULL COMMENT '世界格 X',
  gz          INT          NOT NULL COMMENT '世界格 Z',
  rot         DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '朝向（弧度）',
  state       TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 跟随/游荡 / 0 收回 home',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  KEY idx_chunk (chunk_key),
  KEY idx_owner (uid, created_at),
  CONSTRAINT fk_wpet_owner FOREIGN KEY (uid) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界宠物表（玩家成熟动物牵入世界的跟随宠物，无物理）';

-- 世界物理快照表（physics-service 崩溃恢复，ADR-W7 候选②）
CREATE TABLE IF NOT EXISTS world_physics_snapshot (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  chunk_key   VARCHAR(24)  NOT NULL COMMENT '世界分片标识（当前单服恒为 global；预留分片扩容）',
  tick        BIGINT       NOT NULL COMMENT '物理 tick 号（固定步进计数，恢复时对齐）',
  snapshot    LONGBLOB     NOT NULL COMMENT 'Rapier takeSnapshot() 二进制（Uint8Array）',
  body_count  INT          NOT NULL DEFAULT 0 COMMENT '快照内刚体数（诊断/校验）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_phys_snapshot (chunk_key, tick),
  KEY idx_phys_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='世界物理快照表（physics-service 崩溃恢复，ADR-W7 候选②）';

-- P1 玩家世界位置持久化表（v50：登录恢复到上次离开处，避免刷新随机到新岛）
CREATE TABLE IF NOT EXISTS user_world_state (
  user_id        BIGINT PRIMARY KEY COMMENT '用户ID（关联 users.id）',
  gx             DOUBLE NOT NULL COMMENT '世界格 X（连续坐标）',
  gz             DOUBLE NOT NULL COMMENT '世界格 Z',
  y              DOUBLE NOT NULL COMMENT '高度 Y',
  island_idx     INT    NOT NULL DEFAULT 0 COMMENT '出生/所在岛屿索引（islandCenters[] 下标）',
  variant_idx    INT    NOT NULL DEFAULT 0 COMMENT '岛屿视觉变体索引（仅视觉，非安全敏感）',
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  INDEX idx_uws_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='玩家世界最后位置（每用户一行，登录时恢复，避免每次刷新都随机到新岛）';

-- 牧场拥有动物权威表（v52：取代客户端 localStorage 标记，服务端权威来源）
CREATE TABLE IF NOT EXISTS user_ranch_animals (
  user_id      BIGINT      NOT NULL,
  animal_code  VARCHAR(32) NOT NULL,
  bought_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, animal_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户牧场拥有动物权威表';

-- ============================================================
-- 三、categories 种子增量（大世界建筑/鱼塘设施 + 矿石）
-- 仅 INSERT 缺失行，ON DUPLICATE KEY UPDATE 防重复；不 DELETE，不触碰既有种子
-- ============================================================
INSERT INTO categories (code,name,type,price,sell_price,grow_days,feed_days,exp,level_req,product,prod_price,satiety,energy,color,sort_order) VALUES
 ('wood_house','木屋','building',100,0,0,0,0,1,NULL,0,0,0,'#C98A4B',50),
 ('stone_house','石屋','building',300,0,0,0,0,2,NULL,0,0,0,'#8A8A7A',51),
 ('small_pond','小池塘','pond',50,0,0,0,0,1,NULL,0,0,0,'#2F7FD6',60),
 ('ore_coal','煤矿','resource',0,5,0,0,10,1,NULL,0,0,0,'#3A3A3A',70),
 ('ore_iron','铁矿','resource',0,12,0,0,16,1,NULL,0,0,0,'#B0B0B0',71),
 ('ore_gold','金矿','resource',0,30,0,0,25,2,NULL,0,0,0,'#FFD700',72)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ============================================================
-- 四、（可选）校验：确认关键新增表与列已就位
-- ============================================================
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE table_schema='pet_park'
  AND TABLE_NAME IN ('question_failures','world_config','world_chunks','world_objects',
                     'terrain_mods','world_inventory','world_pets','world_physics_snapshot',
                     'user_world_state','user_ranch_animals')
ORDER BY TABLE_NAME;
