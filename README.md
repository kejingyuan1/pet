# 我的宠物乐园 · 发布版 v48（已上线生产 · 含学历模块）

> 单文件 HTML 离线版 + Angular 19 前端 + Spring Boot 3 后端 + MySQL 5.7
> 一站式「种植 / 养鱼 / 放牧 / 学习 + **学历选择**」个人数字工作台
> **v48 生产部署：阿里云 ECS jar 直跑 + Nginx（绕开被墙的 Docker Hub）→ http://118.31.124.251**
> **v47 新增：学历模块**（注册时选学历 / 考试页下拉按学历过滤题库 · 16 级 小学~大学）
> **v48 新增：全字段 COMMENT（4 表 48 字段 + 表级注释）+ 部署包目录按生产实际重构**（`pet-park/{front, pet-park-server, sql}` 匹配阿里云宝塔目录）

---

## ✅ HY3D 地图修复 + 牧场幼崽/蛋 · 进度（2026-08-17 收尾）

> 本节记录近期攻坚项。相关代码：`pet-park-ng/src/app/components/world3d/world3d.component.ts`（地图）、`ranch.component.ts` + `models.ts` + `state.service.ts`（牧场）、`pet-park-server/.../WorldPhysicsService.java`（服务端物理）。

### ✅ 已完成（已提交 + Playwright 验证）

| 项 | 说明 |
|---|---|
| HY3D 岛屿系统 | 22 个岛屿、4 种 GLB 变体（普通/湖/半岛/山，`assets/3d_build/terrain-hy3d/`，仅 draco 版入库）、LOD 600m 动态加载/卸载 |
| 方案A：随机岛出生 | 玩家出生随机落在某个 HY3D 岛屿；移除程序化草地 fallback |
| **出生钳制 `snapSpawnToIsland`（客户端）** | 只接受高于水位安全线（`waterLevel+0.5`）的命中，螺旋搜索钳到「最高陆地」而非首个命中；对隐藏水面网格禁用 raycast（three r128 `Mesh.raycast` 不检查 `visible`） |
| **湖岛出生修复（完整根因）** | **客户端**（`world3d` 75e107e）：湖心空洞/湖底不再被误判为陆地。**服务端**（`WorldPhysicsService`）：10Hz 广播 `POSITION_SNAPSHOT` 时强制 `p.y = groundY`（`terrain.heightAt()+0.7`），对 HY3D 湖岛环带返回水面 → 客户端陆地 Y 与服务端水面 Y 每 100ms 拉锯 = 「上下闪动」。修复：`p.y > wl+1.2`（客户端已在陆地）时跳过水浮力/低地面强拉，信任客户端的陆地 Y（详见 `WorldPhysicsService` 两条 `🔴 HY3D 湖岛修正` 守卫） |
| **牧场幼崽/蛋接入** | `models.ts` 登记 `RANCH_BABIES`/`RANCH_EGGS`（lifecycle_*.glb）；牧场组件「幼崽区」展示已购动物幼崽、「产蛋区」展示蛋模型；拾蛋玩法（每蛋 +6 金，每日每只下蛋动物产 1 枚） |
| **牧场 Playwright 验证** | E2E：登录→建屋→购鸡/鸭→幼崽/蛋模型加载（babyCount/eggCount≥1）→拾蛋金币增加，VERDICT pass |
| GLB 瘦身 | 仓库只留 draco/小体积版（成年 7 只 ~800K、地形 4 只 4.7–6M、幼崽 lifecycle 36–167K）；19 个几十 M 源 GLB（合计 385M）已从仓库移除、本地磁盘已删 |

### ⏳ 待办 / 部署

1. ~~**服务端湖岛修复部署**（已完成并验证）~~：**✅ 已部署并 E2E 验证通过**。沙箱内绕过坏掉的 `mvn` bash 脚本（直接调 `org.codehaus.plexus.classworlds.launcher.Launcher` + `plexus-classworlds-2.9.0.jar`）成功 `mvn -DskipTests package` 出 **34MB fat jar**（`target/pet-park-server-1.0.0.jar`，含新 `WorldPhysicsService.class`），已 kill 旧 8080 进程并重启新 jar（持续监听 8080）。Playwright E2E（`tools/_verify_no_jump.mjs`）实测 ~10s：**渲染 Y 全程稳定 `2.208`，range=0**；服务端 `serverPy=2.908`（信任客户端陆地 Y，不再拉回水面），`inWater=0`，**上下闪动彻底消失**。前端 4200（`ng serve` 源码，含 `snapSpawnToIsland` 出生钳制）无需改动即生效。
2. **README 主文全面刷新**：v48 主文与当前代码（HY3D / 牧场 / 空气墙根治 / 幼崽蛋 / GLB 瘦身）仍脱节，需整体重写（本次仅刷新了本进度节）。

---

## 🎯 v48 vs v32 关键变化

| 维度 | v32 | v48（当前）|
|---|---|---|
| 学历系统 | ❌ 无 | ✅ **16 级学历**（小学1~6 / 初中1~3 / 高中1~3 / 大学1~4）+ 注册选 + 考试按学历过滤题库 |
| 数据库 | 5 表（users/players/logs/categories/questions）| 4 表（players 合并入 users）+ **users/questions 加 `education` 列 + 48 字段 COMMENT** |
| 部署包 | 平铺（`app.jar` + `dist/` + `mysql/`）| **按生产目录结构**（`pet-park/{front, pet-park-server, sql}` · jar 在 `target/` 下）|
| 后端 jar 名 | `app.jar` | **`pet-park-server-1.0.0.jar`**（Maven default · `target/` 下）|
| 部署脚本 | `deploy-direct.sh` 一键 | **`start.sh` + `stop.sh` + `.env.example`**（含 JDK17 检测 / DB 密码 / 日志 / app.pid）|
| 前端 bundle | 单 `bundle.js`（单文件）| **`bundle.v48.v*.js`**（多版本 + polyfills 单独引 `polyfills-5CFQRCPP.js` · Angular 19 必须保留）|
| 破缓存 | 改内容 | **改文件名 `bundle.v48.v*.js`**（防 nginx 7d expires 缓存）|
| 题库量 | 60 题 | **241 题**（含一年级三科 yuwen/math/english）|
| 启动方式 | `java -jar app.jar` | **`bash start.sh`（source .env）** + `--spring.datasource.password=$DB_PASSWORD`（注意不是 `DB_PASS`）|

---

## 📦 v48 部署包结构（`pet-park-deploy-v48.zip`）

```
pet-park/
├── front/                                 # ★ Angular 19 生产包（match 生产 `/www/wwwroot/pet-park/front/`）
│   ├── index.html                        # 入口（含 inline CSS + Cache-Control no-store）
│   ├── polyfills-5CFQRCPP.js            # ★ 35KB · Angular 19 zone.js runtime（必须保留，缺则白屏）
│   ├── bundle.v48.v5.js                 # ★ 879KB 主 bundle（含 v48 全部特性：学历模块 + 编辑器学历下拉 + 样式美化 + BUG 修复）
│   ├── favicon.ico
│   └── assets/
│       ├── scene.config.json             # 3D 场景配置（model 路径/位置/缩放/fallback 颜色）
│       └── models/                       # .glb/.gltf 3D 模型（房子/树/动物/鱼/宠物）
├── pet-park-server/
│   ├── target/pet-park-server-1.0.0.jar  # ★ 32.7MB Spring Boot fat jar（v47 含 education + v48 全 COMMENT）
│   ├── sql/init.sql                      # DB 初始化（schema.sql + update.sql 拼接，幂等可重跑）
│   ├── .env.example                      # 环境变量模板（cp 为 .env 后改 DB_PASS/JWT_SECRET）
│   ├── start.sh                          # ★ 一键启动（source .env + nohup + 写 app.pid + 写 logs/app.log）
│   └── stop.sh                           # 读 app.pid kill
└── sql/                                   # 顶层 SQL 备份（与 pet-park-server/sql 同步）
    ├── init.sql
    └── update.sql
```

---

## 🎮 核心功能

### 单文件 HTML 版（独立 · 零依赖）
- 直接双击 `pet-park/index.html` 即可玩
- 数据存浏览器 localStorage（`wb_petpark_v7`）
- 离线可用，不需后端
- 纯本地模式（已清理后端对接兜底代码）

### Angular 19 前端（主版本 · v48）
- **6 标签页**：家园 / 菜地 / 鱼塘 / 牧场 / 学习 / 数据管理
- **注册选学历**（v47）：注册页有学历下拉（默认小学一年级，16 级可选）
- **考试下拉按学历过滤**（v47）：考试页下拉只显示 ≤ 用户学历的题库
- 实时 3D 场景（Three.js r128 · OrbitControls · 资源化架构）
- JWT 鉴权 / 云端存档 / 题库动态拉取
- **今天要处理工作台**（v48 BUG 修复：仅首页 `mod==='home'` 显示 · 切 Tab 消失）
- **用户管理**（admin · 学历下拉编辑 + 修复：切到管理时 `mod='admin'` 隐藏工作台）

### Spring Boot 3 后端（v48）
- **users/questions 加 `education` 列**（v46 · 16 级）
- **全表字段 COMMENT**（v48 · 4 表 48 字段 + 4 表级注释）
- JWT 鉴权（jjwt 0.12.6 + BCrypt）
- 5 表 CRUD（users / questions / logs / categories · 4 表）
- 19 类目 + **241 题**题库（含一年级三科 yuwen 60 / math 30 / english 35 + 多科）
- CORS / 统一响应 `Result<T>` / 全局异常处理

### 数据库表结构（v48）
| 表 | 字段数 | 说明 |
|---|---|---|
| `users` | 11 | 含 `education`（学历）+ `role`（admin/user）+ `coins`（积分）+ `state_json`（存档）|
| `questions` | 13 | 含 `subject` + `education`（题库学历）+ `q_type`（choice/match/fill/qa/card）+ `options`（JSON）+ `answer` |
| `logs` | 5 | 事件流水（喂食/收获/学习/...）|
| `categories` | 19 | 统一类目（植物/鱼/动物/家具 · `model` 路径 + `fallback` 颜色）|

`SHOW FULL COLUMNS FROM <table>` 可看完整字段 + COMMENT（Navicat / DBeaver 都能直接显示）。

---

## 🛠️ 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 前端框架 | Angular standalone + CommonModule | 19.2.27 |
| 3D | Three.js + OrbitControls + GLTFLoader | 0.128.0 |
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
│   │   │   │   ├── state.service.ts          # loadQuestions(edu) 按学历过滤
│   │   │   │   └── asset.service.ts         # 3D 模型/贴图加载（loadModel fallback null）
│   │   │   └── components/scene3d/scene3d.component.ts  # Three.js 主场景
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
│       │   ├── PetParkApplication.java
│       │   ├── common/                       # Result + BizException + GlobalExceptionHandler
│       │   ├── config/                       # SecurityConfig + JwtAuthFilter
│       │   ├── controller/
│       │   │   ├── AuthController.java      # register/login/me/profile/password
│       │   │   └── QuestionController.java  # ★ list() 支持 `?subject=&education=`（v47）
│       │   ├── dto/                          # LoginReq/Resp + RegisterReq ★ @Pattern education + UpdateProfileReq
│       │   ├── entity/                       # User ★ education + Question ★ education
│       │   ├── mapper/                      # MyBatis-Plus BaseMapper
│       │   └── service/                     # UserService（register/updateProfile 含 education）
│       └── resources/
│           ├── application.yml              # 端口 8080 / DB / JWT
│           ├── schema.sql                   # ★ 4 表 + 全字段 COMMENT（v48）
│           └── update.sql                   # ★ 增量：role + education + COMMENT 幂等 ALTER
│
├── pet-park-deploy-v48.zip                   # ★ 一键部署包（30MB · 按生产目录结构 · 含 v48 全部修复）
└── pet-update-v48.sql                        # ★ 今晚纯增量 SQL（只 role/education/COMMENT，不动业务）
```

---

## 🚀 生产部署（v48 · 阿里云 ECS · 宝塔）

**环境信息**：
| 项 | 值 |
|---|---|
| 服务器 | 阿里云 ECS `iZbp18sfxjpmt9coe7oznbZ`（宝塔 9.x） |
| 公网 | `http://118.31.124.251`（Nginx 80 端口代理 Angular static） |
| 后端 | `java -jar pet-park-server-1.0.0.jar`（端口 8080，nohup 后台） |
| 数据库 | 宝塔 MySQL 5.7.44（`127.0.0.1:3306` · 库 `pet_park` · root / `83458848de46385e`） |
| 部署目录 | `/www/wwwroot/pet-park/{front, pet-park-server, sql}` |

### 部署步骤（3 步）

```bash
# ① 上传 + 解压（生产目录必须保留分层结构！）
scp pet-park-deploy-v48.zip root@118.31.124.251:/tmp/
ssh root@118.31.124.251
cd /www/wwwroot/pet-park      # 已有生产目录就 cd 进去
unzip -o /tmp/pet-park-deploy-v48.zip

# ② 配 .env（生产必改 DB_PASS / JWT_SECRET；MySQL root 密码 83458848de46385e）
cd pet-park-server
cp .env.example .env
vi .env                         # 改 DB_PASS=83458848de46385e + JWT_SECRET=openssl rand -hex 32

# ③ 初始化 DB（幂等可重复）+ 启动后端
mysql -uroot -p'83458848de46385e' --default-character-set=utf8mb4 < ../sql/init.sql
bash start.sh
# 验证
sleep 8
tail -10 logs/app.log                # 应见 "Started PetParkApplication" + 无 Access denied
curl -s http://127.0.0.1:8080/api/categories | head -c 200
curl 'http://127.0.0.1:8080/api/questions?education=PRIMARY_1&subject=math' | head -c 200
```

**浏览器强刷**（Ctrl+Shift+R）→ 看到完整登录页 + 温馨背景 + 学历下拉。

### 关键部署坑（v48 必看）

| # | 坑 | 解决 |
|---|---|---|
| 1 | **MySQL host 授权**：宝塔默认只授权 `root@'localhost'`，JDBC 用 `127.0.0.1` 连 → Access denied | `.env` 用 `DB_HOST=localhost`（走 Unix socket 匹配 `root@'localhost'`），或 `CREATE USER 'root'@'127.0.0.1' IDENTIFIED BY 'xxx'` |
| 2 | **start.sh 变量名**：`application.yml` 用 `DB_PASSWORD`，我之前 start.sh 写 `DB_PASS` 不一致——直接 `java -jar` 会 fallback 到内置 123456 → Access denied | **必须用 `bash start.sh`**（它 `--spring.datasource.password=$DB_PASSWORD` 覆盖 yaml）|
| 3 | **mysql 客户端字符集**：`mysql < init.sql` 必须带 `--default-character-set=utf8mb4`，否则中文 INSERT 超长 | `--default-character-set=utf8mb4` |
| 4 | **Angular polyfills 必须保留**：`bundle.v48.v5.js` (= main) 是 minified 但**不**含 zone.js runtime（Angular 19 拆开了） | `index.html` 必须有 `<script src="polyfills-5CFQRCPP.js" type="module">` **在** bundle 之前；缺则 `bodyLen=80` 白屏 |
| 5 | **nginx 7d 缓存**：`/assets/*` `expires 7d`，旧版 bundle.js 缓存导致 Angular 启动失败 | 改 bundle 文件名（`bundle.js` → `bundle.v48.v*.js`）破缓存；或让用户 F12 勾 Disable cache |
| 6 | **Docker Hub 被墙**：ECS 到 registry-1.docker.io 超时 | 放弃 Docker，改 **jar 直跑 + Nginx**（deploy 包走这条路） |
| 7 | **nginx 路径**：宝塔只 include `/www/server/panel/vhost/nginx/*.conf` | 放 vhost 目录（不要放 `/www/server/nginx/conf/`）+ `listen 80 default_server` |
| 8 | **init.sql 幂等**：questions 表缺唯一索引时重复执行题库翻倍 | schema.sql 含 `UNIQUE KEY (subject, group_id, prompt(200))` + INSERT 前 DELETE 现有数据 |
| 9 | **3D 模型缺失**：`public/assets/models/` 放 91 字节路径占位符 → GLTFLoader 失败 → 走 fallback 几何体（房子=方块、宠物=球） | 你给真 .glb 源文件放进 `public/assets/models/`，重 build；或我帮你从 Quaternius / PolyHaven 拉 CC0 资产 |
| 10 | **`--ease` CSS 写错**（我 Write index.html 时手抖把 `0.36` 写成 `36`）| 已修，用 `cubic-bezier(.22, 1, 0.36, 1)` |

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
# （含 4 表 + 全字段 COMMENT + 19 类目 + 241 题种子数据）
```

**端到端**：Angular ng serve → 自动 proxy `/api` → 127.0.0.1:8080 → MySQL。

---

## 🌐 API 接口

| 接口 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/auth/register` | POST | 否 | 注册（含 `education` 字段，v47）|
| `/api/auth/login` | POST | 否 | 登录返回 token |
| `/api/auth/me` | GET | 是 | 当前用户信息（含 `education`）|
| `/api/auth/profile` | PUT | 是 | 改 username/nickname/**education** |
| `/api/auth/password` | PUT | 是 | 改密码 |
| `/api/auth/admin/users` | GET | admin | 列出所有用户 |
| `/api/auth/admin/users/:id` | PUT | admin | admin 改用户（username/nickname/role/coins/**education**）|
| `/api/state` | GET | 是 | 拉存档 |
| `/api/state` | PUT | 是 | 推存档 |
| `/api/categories` | GET | 否 | 19 类目 |
| `/api/questions` | GET | 否 | 题库（`?subject=math&education=JUNIOR_2` · v47 按学历过滤）|
| `/api/logs` | POST | 是 | 写日志 |

所有响应 `{"code":0,"msg":"ok","data":...}`，错误 code≠0。鉴权头 `Authorization: Bearer <token>`。

---

## 📐 数据库设计（v48 关键字段 + COMMENT）

`schema.sql` / `update.sql` 都已带 COMMENT，可直接 `SHOW CREATE TABLE` 查看。下面是重点：

```sql
-- users 表（11 字段，v48 全 COMMENT）
education  VARCHAR(16) NOT NULL DEFAULT 'PRIMARY_1'  -- 学历：PRIMARY_1..6 小学 / JUNIOR_1..3 初中 / SENIOR_1..3 高中 / UNIVERSITY_1..4 大学
role       VARCHAR(16) NOT NULL DEFAULT 'user'      -- 角色：user 普通 / admin 管理员
coins      INT          NOT NULL DEFAULT 0          -- 积分（独立字段）
state_json JSON         NULL                       -- 游戏存档

-- questions 表（13 字段）
subject    VARCHAR(16) NOT NULL       -- 科目：english / math / hanzi / chengyu / thinking / yuwen
education  VARCHAR(16) NOT NULL DEFAULT 'PRIMARY_1'  -- 题目所属学历（按此过滤）
q_type     VARCHAR(16) NOT NULL DEFAULT 'choice'  -- 题型：choice / match / fill / qa / card
options    JSON         NULL           -- 选择题 [{text, correct, icon}]
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
# 后端启动 / 停止
cd /www/wwwroot/pet-park/pet-park-server
bash start.sh                # 启动（source .env + nohup + 写 app.pid + 写 logs/app.log）
bash stop.sh                 # 读 app.pid kill
tail -f logs/app.log          # 实时日志

# 数据库备份（宝塔计划任务每天 3 点）
mysqldump -uroot -p'83458848de46385e' pet_park > /www/backup/pet_park_$(date +%Y%m%d).sql

# Nginx 重载
nginx -t && nginx -s reload

# 紧急停止后端
pkill -f pet-park-server

# 启动登录页（已注册测试账号）
用户名: edu_test1 / 密码: abc123 / 学历: JUNIOR_2（可登录测试考试下拉）
```

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
| **v47** | **学历模块**：users/questions 加 `education`（16 级小学~大学）+ 注册选学历 + 考试下拉按学历过滤题库 + DB_PASS 修复 + 全字段 COMMENT |
| **v48** | **部署包目录重构**（按生产实际：`pet-park/{front, pet-park-server, sql}` · jar 在 `target/pet-park-server-1.0.0.jar` · 顶层 sql/ 备份）+ **今天要处理工作台限定 `mod==='home'`** + **用户管理切到时 `mod='admin'` 隐藏工作台** + **学历下拉样式美化**（::ng-deep 破 encapsulation + 自定义橙三角 SVG）+ **破缓存文件名 `bundle.v48.v*.js`** + **polyfills 单独引** + **start.sh 变量名 `DB_PASSWORD`** |

---

## 🔗 关键部署文件

| 文件 | 大小 | 用途 |
|---|---|---|
| `pet-park-deploy-v48.zip` | ~30MB | **★ 一键部署包**（v48 生产目录结构）|
| `pet-update-v48.sql` | 7.5KB | **★ 今晚纯增量 SQL**（role/education/COMMENT 幂等 · 不碰已有数据）|
| `pet-park-server/src/main/resources/schema.sql` | 18KB | 完整建库脚本（v48 含 COMMENT）|
| `pet-park-server/src/main/resources/update.sql` | 13KB | 增量升级（v39-v48 全部 ALTER 累积，幂等）|

---

## 📜 License & 致谢

- **代码**：MIT（个人项目，欢迎学习/参考）
- **3D 模型**：CC0（来自 Quaternius / PolyHaven CC0 资产库）
- **题库内容**：开源 + 原创混合
- **致谢**：Three.js / Angular / Spring Boot / MyBatis-Plus / MySQL 社区

> 最后更新：2026-08-12 · v48 学历模块 + 全字段 COMMENT + 部署包重构已上线
