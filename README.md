# 我的宠物乐园 · 3D 大世界联机版（Angular 19 + Three.js + Spring Boot 3 + WebSocket）

> **多人在线 3D 宠物乐园**：3D 大世界（22 岛 HY3D 地形 / 星空 / 云朵 / 昼夜）+ 牧场（幼崽 / 蛋 / 动物游走吃草）+ 学习（241 题 6 科目 + 16 级学历）
> **联机架构**：WebSocket 实时同步（自动重连 + 心跳）+ 玩家实时位置广播（10Hz）
> **技术栈**：Angular 19 前端（4200）+ Spring Boot 3 后端（8080）+ Three.js r128 + MySQL 5.7
> **生产部署**：阿里云 ECS jar 直跑 + Nginx → http://118.31.124.251（域名 kjyxf.cn / www.kjyxf.cn）

---

## ✅ 近期攻坚进度（v49–v52）

> 相关代码：`pet-park-ng/src/app/components/world3d/world3d.component.ts`（大世界 / 星空 / 湖岛）、`ranch.component.ts`（牧场）、`app.component.html/css`（入口 / 工具栏）、`pet-park-server/.../WorldPhysicsService.java` + `PetParkApplication.java` + `schema.sql`（物理 / 登录）。

### 大世界（world3d）

| 项 | 说明 |
|---|---|
| HY3D 岛屿系统 | 22 岛、4 种 GLB 变体（普通/湖/半岛/山）、网格布局 `CELL=700`（根治岛屿重叠 → raycast 上下闪）、LOD 300m 动态加载（任意位置最多 1 岛） |
| 星空 | CanvasTexture 星空底图 + Points 闪烁层；星点压缩到上半球 `phiTop∈[0°,70°]` 根治地平环弧线；`updateDayNight` 昼夜切换背景 |
| 云朵 | 4 朵 CanvasTexture 漂移云（牧场内）；大世界云由天空渐变 + 漂移精灵 |
| 水面 | 全局半透明水面 `transparent + depthWrite:false`（治本 z-fight）+ 着色器波光 |
| **湖岛沉水修复** | `groundH = heightAt()` 读服务端原始高度（水域格是深水 -13）→ 湖岛沉海底；钳到 `waterLevel` 后湖岛稳定浮水面（水域岛浮水面、陆地岛用真实高度） |

### 牧场（ranch）

| 项 | 说明 |
|---|---|
| 场景 | 双层草地 + 32 立柱 2 横栏围栏 + 30 草簇（替代白地板）+ CanvasTexture 渐变天空 + 4 朵漂移云 |
| 动物行为 | 7 只动物：6 陆生程序化状态机（wander→到达→吃草/闲歇→pickTarget，随机游走 + 低头吃草，YXZ 欧拉，全在围栏内）+ 1 鱼在围栏外圆形鱼池 `POND(-6,5)` 沿池周游（baseY 介于池底/水面之间，半透明水下可见）|
| 鱼池 | 围栏外圆形水池（池底/水面/石圈以 `depth=0.0` 为基准上抬 `-0.01/+0.01`，根治被外圈草地 `y=-0.02` 遮挡看不见）；相机高位 3/4 俯视 `position(0,9,12) lookAt(-2,1.5,1) fov=50°` 容纳鱼池 + 避开商店/房屋面板 |
| 拥有动物持久化 | 后端 `user_ranch_animals` 表（复合主键 user_id+animal_code）+ `GET /api/ranch/animals` / `POST /api/ranch/buy`（动物代码白名单校验 + `INSERT IGNORE` 防重复）；前端进牧场先拉服务端覆盖本地（治"没买却已拥有"）|
| 幼崽/蛋 | `RANCH_BABIES`/`RANCH_EGGS`（lifecycle_*.glb）；幼崽区 + 产蛋区展示；拾蛋 +6 金 |

### 联机 + 入口

| 项 | 说明 |
|---|---|
| WebSocket 联机 | 自动重连 + 心跳（WEB 联网游戏生命线）；「在线 N」玩家数；删掉「已连接」徽章（联网常态=视觉噪声，逻辑保留） |
| 牧场入口 | 从顶栏浮动按钮 → 大世界工具栏 `🐮 牧场` 按钮（`@Output openRanchRequest` 解耦循环 import） |

### 后端（物理 / 登录）

| 项 | 说明 |
|---|---|
| 移动提速 | 物理 tick 独立调度器 `physicsTaskScheduler`（单线程 60Hz）+ 普通 `taskScheduler`（poolSize=4），根治 @Scheduled 物理循环被 DB 写任务饿死（原移动速度被钳到 ~0.9 u/s，仅正常 1/4） |
| 登录 500 修复 | `schema.sql` 补幂等 `gender` 列 ALTER（此前 `SELECT gender` 报 Unknown column → 登录全挂） |

### 验证

- E2E（Playwright + Chromium headless/swiftshader）：`tools/verify_ranch.cjs`（牧场动物游走 7/7）、`tools/verify_world_polish.cjs`（星空/徽章/牧场按钮）、`tools/verify_shore_clip.cjs`（湖岛稳定浮水 + 0 报错）。全部 0 console error。
- **v52 牧场鱼池 + 持久化 E2E**：`tools/verify_ranch_fish.cjs`（鱼在池周 distPond<2.2 且围栏外 + 6 陆生在 paddock，0 报错）、`tools/verify_ranch_pet.cjs`（v51 抚摸交互在高位相机下无回归，rx 0.48>0.3）、`tools/verify_ranch_db.mjs`（注册→买鱼→重复购买拒 1001001→非法 code 拒，9/9）、`tools/verify_ranch_persist.mjs`（重启后端后鱼仍在，确证 DB 持久化非内存）。

---

## 🎮 核心功能

### 3D 大世界（主场景 · Three.js r128）
- **22 座 HY3D 岛屿**（4 种 GLB 变体：普通 / 湖 / 半岛 / 山），网格布局根治重叠
- **动态昼夜**：星空（CanvasTexture 底图 + Points 闪烁）/ 渐变天空 / 漂移云朵 / 半透明水面
- **实时联机**：WebSocket 多人在线，玩家位置 10Hz 广播，自动重连 + 心跳
- **探索玩法**：WASD 移动 + 跳跃 + 游泳 / 采矿 / 钓鱼 / 聊天

### 牧场（幼崽养成）
- 围栏草地场景（双层草地 + 围栏 + 草簇）+ 渐变天空 + 漂移云
- **动物程序化行为**：7 只动物随机游走 + 低头吃草（状态机驱动，非动画）
- **幼崽 / 蛋**：幼崽区展示已购幼崽、产蛋区展示蛋模型、拾蛋 +6 金
- 入口：大世界工具栏 `🐮 牧场` 按钮（登录后可见）

### 学习模块（学历 + 题库）
- **注册选学历**（16 级：小学 1~6 / 初中 1~3 / 高中 1~3 / 大学 1~4）
- **考试下拉按学历过滤**：只显示 ≤ 用户学历的题库
- **241 题** 6 科目（英语 / 数学 / 汉字 / 成语 / 思维 / 语文）
- 错题自动收录到「今日学习」

### Spring Boot 3 后端
- **联机物理**：60Hz 独立物理 tick 调度器（与 DB 写定时任务隔离，移动速度恒定）
- **玩家状态**：`gender` 字段决定男孩/女孩建模；JWT 鉴权（jjwt + BCrypt）
- **题库**：19 类目 + 241 题 + `education` 学历过滤
- CORS / 统一响应 `Result<T>` / 全局异常处理

### 数据库表结构
| 表 | 字段数 | 说明 |
|---|---|---|
| `users` | 11 | 含 `education`（学历）+ `role`（admin/user）+ `coins`（积分）+ `state_json`（存档）|
| `questions` | 13 | 含 `subject` + `education`（题库学历）+ `q_type`（choice/match/fill/qa/card）+ `options`（JSON）+ `answer` |
| `logs` | 5 | 事件流水（喂食/收获/学习/...）|
| `categories` | 19 | 统一类目（植物/鱼/动物/家具 · `model` 路径 + `fallback` 颜色）|
| `user_ranch_animals` | 3 | 牧场拥有动物（复合主键 `user_id`+`animal_code` · `bought_at` 默认 CURRENT_TIMESTAMP）|
| `user_world_state` | — | 玩家大世界最后位置（业务持久化，治"刷新随机到新岛"）|

`SHOW FULL COLUMNS FROM <table>` 可看完整字段 + COMMENT（Navicat / DBeaver 都能直接显示）。

---

## 🛠️ 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 前端框架 | Angular standalone + CommonModule | 19.2.27 |
| 3D | Three.js + OrbitControls + GLTFLoader | 0.128.0 |
| 联机 | WebSocket（自动重连 + 心跳）+ 10Hz 位置广播 | — |
| 后端 | Spring Boot + MyBatis-Plus + jjwt + BCrypt | 3.3.5 / 3.5.7 / 0.12.6 |
| 数据库 | MySQL utf8mb4_unicode_ci | 5.7 |
| 构建 | Maven + Angular CLI (esbuild) + npx | 3.9.12 |
| JDK | OpenJDK | 17.0.20 |
| Node | Node.js | 22.22.2 |

---

## 📁 源码结构

```
pet/                                          # GitHub kejingyuan1/pet
├── README.md                                  # 本文件
├── PROJECT_DOC.md                             # 项目详细文档（版本演进）
│
├── pet-park-ng/                               # Angular 19 前端源码
│   ├── angular.json                           # 配 assets 只 copy public/
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.component.ts              # ★ 核心：6 模块导航 + 学历下拉 + 编辑器 + mod 控制
│   │   │   ├── app.component.html
│   │   │   ├── app.component.css             # 含 ::ng-deep .reg-edu-select / .study-edu-select 学历下拉样式
│   │   │   ├── models.ts                     # UserInfo + Education enum
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts           # login/register/me/updateProfile（register 传 education）
│   │   │   │   ├── state.service.ts          # loadQuestions(edu) 按学历过滤 + loadOwnedAnimalsFromServer/buyAnimal
│   │   │   │   └── asset.service.ts         # 3D 模型/贴图加载（loadModel fallback null）
│   │   │   └── components/
│   │   │       ├── scene3d/scene3d.component.ts  # Three.js 主场景（大世界）
│   │   │       └── ranch/ranch.component.ts       # 牧场展厅（动物/鱼池/相机）
│   │   └── styles.css                        # 全局样式（背景渐变 + CSS 变量 · body/:root 必须放这）
│   └── public/
│       └── assets/
│           ├── scene.config.json             # 3D 场景配置
│           ├── README.md
│           ├── models/                       # .glb/.gltf 模型（house.glb / tree.glb / chicken.glb / pet.glb 等）
│           └── textures/
│
├── pet-park-server/                          # Spring Boot 3 后端源码
│   ├── pom.xml                                # spring-boot-starter-parent 3.3.5
│   └── src/main/
│       ├── java/com/petpark/
│       │   ├── PetParkApplication.java        # ★ @MapperScan 含 ranch.mapper
│       │   ├── common/                       # Result + BizException + GlobalExceptionHandler
│       │   ├── config/                       # SecurityConfig + JwtAuthFilter
│       │   ├── controller/
│       │   │   ├── AuthController.java      # register/login/me/profile/password
│       │   │   ├── QuestionController.java  # ★ list() 支持 `?subject=&education=`
│       │   │   ├── RanchController.java     # ★ GET /api/ranch/animals · POST /api/ranch/buy（v52）
│       │   │   └── PositionController.java  # ★ 玩家位置持久化（v50）
│       │   ├── dto/                          # LoginReq/Resp + RegisterReq @Pattern education + UpdateProfileReq
│       │   ├── entity/                       # User education + Question education + UserRanchAnimal + UserWorldState
│       │   ├── mapper/                      # MyBatis-Plus BaseMapper（含 ranch.mapper）
│       │   ├── service/                     # UserService + WorldPhysicsService（60Hz 物理）+ RanchService
│       │   └── world/                       # 大世界相关业务（mapper/service 分包）
│       └── resources/
│           ├── application.yml              # 端口 8080 / DB / JWT
│           ├── schema.sql                   # ★ 全部建表 + 全字段 COMMENT（幂等可重跑）
│           └── update.sql                   # ★ 增量：role + education + COMMENT 幂等 ALTER
│
└── tools/                                     # E2E 验证脚本（Playwright / Node）
    ├── verify_ranch.cjs / verify_world_polish.cjs / verify_shore_clip.cjs
    ├── verify_ranch_fish.cjs / verify_ranch_pet.cjs   # v52 鱼池 + 抚摸回归
    └── verify_ranch_db.mjs / verify_ranch_persist.mjs  # v52 后端端点 + 落库持久化
```

---

## 🔨 本地开发

```bash
# 后端
cd pet-park-server
mvn clean package -DskipTests          # 产出 target/pet-park-server-1.0.0.jar
java -jar target/pet-park-server-1.0.0.jar --server.port=8080

# 前端
cd pet-park-ng
npm install
npm start                              # 4200 端口

# 数据库
mysql -uroot -p123456 --default-character-set=utf8mb4 < pet-park-server/src/main/resources/schema.sql
# （含全部建表 + 全字段 COMMENT + 19 类目 + 241 题种子数据）
```

**端到端**：Angular ng serve → 自动 proxy `/api` → 127.0.0.1:8080 → MySQL。

---

## 🌐 API 接口

| 接口 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/auth/register` | POST | 否 | 注册（含 `education` 字段）|
| `/api/auth/login` | POST | 否 | 登录返回 token |
| `/api/auth/me` | GET | 是 | 当前用户信息（含 `education`）|
| `/api/auth/profile` | PUT | 是 | 改 username/nickname/**education** |
| `/api/auth/password` | PUT | 是 | 改密码 |
| `/api/auth/admin/users` | GET | admin | 列出所有用户 |
| `/api/auth/admin/users/:id` | PUT | admin | admin 改用户（username/nickname/role/coins/**education**）|
| `/api/state` | GET | 是 | 拉存档 |
| `/api/state` | PUT | 是 | 推存档 |
| `/api/ranch/animals` | GET | 是 | 拉当前用户「已拥有牧场动物」权威列表（后端 `user_ranch_animals` 表）|
| `/api/ranch/buy` | POST | 是 | 购买动物（`{code}` · 白名单校验 + `INSERT IGNORE` 防重复）|
| `/api/world/position` | GET/PUT | 是 | 玩家大世界最后位置持久化（v50）|
| `/api/categories` | GET | 否 | 19 类目 |
| `/api/questions` | GET | 否 | 题库（`?subject=math&education=JUNIOR_2` · 按学历过滤）|
| `/api/logs` | POST | 是 | 写日志 |

所有响应 `{"code":0,"msg":"ok","data":...}`，错误 code≠0。鉴权头 `Authorization: Bearer <token>`。

---

## 📐 数据库设计

`schema.sql` / `update.sql` 都已带 COMMENT，可直接 `SHOW CREATE TABLE` 查看。下面是重点：

```sql
-- users 表（11 字段，全字段 COMMENT）
education  VARCHAR(16) NOT NULL DEFAULT 'PRIMARY_1'  -- 学历：PRIMARY_1..6 小学 / JUNIOR_1..3 初中 / SENIOR_1..3 高中 / UNIVERSITY_1..4 大学
role       VARCHAR(16) NOT NULL DEFAULT 'user'      -- 角色：user 普通 / admin 管理员
coins      INT          NOT NULL DEFAULT 0          -- 积分（独立字段）
state_json JSON         NULL                       -- 游戏存档

-- questions 表（13 字段）
subject    VARCHAR(16) NOT NULL       -- 科目：english / math / hanzi / chengyu / thinking / yuwen
education  VARCHAR(16) NOT NULL DEFAULT 'PRIMARY_1'  -- 题目所属学历（按此过滤）
q_type     VARCHAR(16) NOT NULL DEFAULT 'choice'  -- 题型：choice / match / fill / qa / card
options    JSON         NULL           -- 选择题 [{text, correct, icon}]

-- user_ranch_animals 表（v52 牧场拥有动物，复合主键防重复）
user_id     BIGINT       NOT NULL
animal_code VARCHAR(32)  NOT NULL
bought_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
-- PRIMARY KEY (user_id, animal_code) + INSERT IGNORE 防重复

-- user_world_state 表（v50 玩家大世界最后位置）
user_id   BIGINT      NOT NULL PRIMARY KEY
pos_x/y/z DOUBLE      -- 最后落点
updated_at TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP
```

**16 级学历**（`regEducation` / `editForm.education` 枚举）：
```
PRIMARY_1 ~ PRIMARY_6  小学 1~6 年级
JUNIOR_1  ~ JUNIOR_3    初中 1~3 年级
SENIOR_1  ~ SENIOR_3    高中 1~3 年级
UNIVERSITY_1 ~ UNIVERSITY_4  大学 1~4 年级
```

**考试下拉**默认显示用户学历及以下（`studyEduOptions = all.slice(0, myRank+1)`），切换时调 `/api/questions?education=<value>` 拉题。

---

## 📞 关键运维

```bash
# 后端启动 / 停止（生产）
cd /www/wwwroot/pet-park/pet-park-server
bash start.sh                # 启动（source .env + nohup + 写 app.pid + 写 logs/app.log）
bash stop.sh                 # 读 app.pid kill
tail -f logs/app.log          # 实时日志

# 数据库备份（宝塔计划任务每天 3 点）
mysqldump -uroot -p'<DB_PASSWORD>' pet_park > /www/backup/pet_park_$(date +%Y%m%d).sql

# Nginx 重载
nginx -t && nginx -s reload

# 紧急停止后端
pkill -f pet-park-server

# 启动登录页（已注册测试账号）
用户名: edu_test1 / 密码: abc123 / 学历: JUNIOR_2（可登录测试考试下拉）
```

> ⚠️ 生产数据库密码、JWT 密钥等敏感信息一律通过 `.env` / 环境变量注入，**不要明文写进 README 或提交到仓库**。

---

## 📝 版本演进

| 版本 | 关键节点 |
|---|---|
| v1-v16 | 宠物乐园核心玩法（菜地/鱼塘/宠物/天气/3D 场景）|
| v17-v20 | 宠物导航 A* + 沿墙滑行 + 回家状态机 |
| v21 | 统一类目表 + 牧场产出冷却 |
| v22 | Spring Boot 3 后端 + MySQL schema + JWT |
| v23 | Angular 19 前端 + proxy 代理 |
| v25-v26 | 沙箱内 Angular 构建链 + 5 科目 60 题 + 单文件版清理 |
| v32 | 生产部署：jar 直跑 + Nginx + 阿里云 ECS（绕开 Docker Hub）|
| v44-v46 | 学问体题库扩充（241 题）+ 全字段 COMMENT 准备 |
| **v47** | **学历模块**：users/questions 加 `education`（16 级小学~大学）+ 注册选学历 + 考试下拉按学历过滤题库 + DB 密码变量修复 + 全字段 COMMENT |
| **v49** | **3D 大世界联机化**：22 岛网格布局根治重叠 + 星空 CanvasTexture + 云朵 + 半透明水面；**牧场打磨**（草地围栏 / 动物游走吃草 / 幼崽蛋）；**移动提速**（物理独立调度器 60Hz）；**登录 500 修复**（补 gender 列）；**湖岛沉水修复**（heightAt 钳到 waterLevel）；删「已连接」徽章、牧场入口移到工具栏 |
| **v50** | **阶段 E · 大世界四项修复**：A **海面扩展** `size` 3200→10000；B **水速降 4×** + Gerstner 陡度降；C **湖岛岸边穿模黑坑根治**（4 变体加不透明湖底盘 + 入水回退硬保护）；D **玩家位置持久化根因修复**（`user_world_state` 表 + `PositionController` + 落地即保存 + 进世界每 10s 定时保存，彻底解决"每次刷新随机到新岛"）|
| **v51** | **牧场交互打磨**：进牧场鼠标变「小手」；**点击动物抚摸触发低头**（`AnimalState.petUntil` + 射线拾取命中后开 ~2s 低头窗口）；**去掉随机游走低头**（低头只在抚摸时出现）|
| **v52** | **牧场鱼池 + 拥有动物持久化（RANCH-FISH-DB-001）**：① **鱼入池**——鱼移出围栏草地，新建围栏外圆形鱼池 `POND(-6,5)`、鱼沿池周游；**鱼池可见性根治**（池底/水面/石圈以 `depth=0.0` 为基准上抬 `-0.01/+0.01`，浮在草地上）；② **拥有动物后端持久化**——`user_ranch_animals` 表（复合主键）+ `RanchController`（`GET /api/ranch/animals` / `POST /api/ranch/buy`，白名单校验 + `INSERT IGNORE`）+ 前端进牧场先拉服务端覆盖本地（治"没买却已拥有"）；③ **相机高位 3/4 俯视** `position(0,9,12) lookAt(-2,1.5,1) fov=50°`；④ 验证：Playwright `verify_ranch_fish.cjs` / `verify_ranch_db.mjs`（9/9）/ `verify_ranch_persist.mjs` / `verify_ranch_pet.cjs`（rx 0.48>0.3）|

---

## 📜 License & 致谢

- **代码**：MIT（个人项目，欢迎学习/参考）
- **3D 模型**：CC0（来自 Quaternius / PolyHaven CC0 资产库）
- **题库内容**：开源 + 原创混合
- **致谢**：Three.js / Angular / Spring Boot / MyBatis-Plus / MySQL 社区

> 最后更新：2026-08-19 · v52 牧场鱼池（鱼入池）/ 拥有动物后端持久化 / 高位 3-4 俯视相机
