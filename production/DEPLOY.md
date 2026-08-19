# 生产部署 · 数据库脚本包（pet-park）

本目录是**数据库部署/升级**的权威来源，与代码 `pet-park-server/src/main/resources/schema.sql` 保持同步。

## 两个脚本的区别（务必看清再用）

| 脚本 | 用途 | 是否改已有数据 | 适用场景 |
|---|---|---|---|
| **`UPDATE.SQL`** | **增量升级**（v48 → 当前 v52） | ❌ 仅新增表/列/种子，**不改任何已有数据**，也不执行 DELETE | ✅ **你现有生产库就用这个** |
| **`init.sql`** | **全新初始化** | ⚠️ 会 `DELETE FROM categories/questions` 后重插种子（重置题库/类目，不动 users/logs 业务数据） | 仅空库首次建库时用 |

> ⚠️ **不要**把 `init.sql` 跑在已经上线的生产库上——它会清空并重插题库/类目种子。
> 升级已有库一律用 `UPDATE.SQL`。

## 一、升级现有生产库（最常见）

```bash
# 1) 先备份（宝塔计划任务 / 手动）
mysqldump -uroot -p'<DB_PASSWORD>' pet_park > /www/backup/pet_park_$(date +%Y%m%d).sql

# 2) 执行增量升级（幂等，可重复跑，安全）
mysql -uroot -p'<DB_PASSWORD>' --default-character-set=utf8mb4 pet_park < production/UPDATE.SQL
```

`UPDATE.SQL` 自带末尾校验 `SELECT`，执行完会列出 10 张新增表确认就位。
若想先 dry-run 看影响，可在测试库先跑一遍再上生产。

## 二、全新安装（空库）

```bash
mysql -uroot -p'<DB_PASSWORD>' --default-character-set=utf8mb4 < production/init.sql
```

## v48 → 当前（v52）的数据库增量清单

**`users` 表新增列（9 个，全部可空或有默认值，不影响老数据）：**
`pos_x` `pos_z` `pos_y` `last_chunk` `energy` `level` `experience` `energy_updated_at` `gender`

- `gender` 是登录 500 修复项：User 实体/LoginResp 已引用该列，v48 未建 → 不补会登录全挂。

**新增表（10 张）：**
`question_failures`（错题本）· `world_config`（世界配置）· `world_chunks`（地形缓存）
`world_objects`（玩家建筑/鱼塘）· `terrain_mods`（地形修改）· `world_inventory`（世界背包）
`world_pets`（世界宠物）· `world_physics_snapshot`（物理快照）· `user_world_state`（**v50 玩家位置持久化**）· `user_ranch_animals`（**v52 牧场拥有动物**）

**`categories` 种子新增（6 行）：** `wood_house` `stone_house` `small_pond` `ore_coal` `ore_iron` `ore_gold`

> 说明：以上全部为**加法**变更，无列类型修改、无数据迁移，故 `UPDATE.SQL` 对生产库零风险。

## 安全事项

- ❌ **切勿把数据库密码明文写进脚本或提交到仓库**。密码走服务器 `.env` / 命令行参数（`-p'<DB_PASSWORD>'`）。
- 旧版 README 曾误含明文生产库密码，已删除；如生产服务器仍用旧密码，建议一并轮换。
- `production/sql/world_init.sql` 是早期世界模块独立脚本，**已被 `init.sql` / `UPDATE.SQL` 合并取代**，请勿再单独使用。

## 与代码版本对齐

- 当前代码版本：**v52**（牧场鱼池 + 拥有动物后端持久化 + 高位相机）
- `init.sql` / `UPDATE.SQL` 内容需与 `pet-park-server/src/main/resources/schema.sql` 保持一致；改动 schema 后请同步刷新本目录。
