# 我的宠物乐园 · 发布版 v32（已上线生产）

> 单文件 HTML 离线版 + Angular 19 前端 + Spring Boot 3 后端 + MySQL 5.7
> 一站式「种植 / 养鱼 / 放牧 / 学习」个人数字工作台
> **v32 生产部署：阿里云 ECS jar 直跑 + Nginx（绕开被墙的 Docker Hub）→ http://118.31.124.251**
> **v30 新增：场景资源化架构 — 房屋/动植物/鱼/地图全部支持外部模型文件（.glb/.gltf）引入**

---

## 📦 项目结构

```
pet-park/
├── index.html                        # 单文件 HTML 版（~193KB，开箱即用）
├── index.html.bak_v23                # 备份（v23 含后端对接代码，已清理）
├── PROJECT_DOC.md                    # 项目详细文档（版本演进、技术决策）
├── README.md                         # 本文件
│
├── pet-park-ng/                      # Angular 19 前端
│   ├── proxy.conf.json               # /api → 127.0.0.1:8080
│   ├── package.json                  # 依赖（@angular 19 + three 0.128）
│   ├── public/
│   │   └── assets/                   # ★ v30 资源化：外部模型配置
│   │       ├── scene.config.json     # 场景布局配置（位置/缩放/模型引用）
│   │       ├── models/               # .glb/.gltf 模型文件（房屋/树/动物/鱼/宠物）
│   │       ├── textures/             # 贴图
│   │       └── README.md             # 资源接入指南
│   ├── src/
│   │   ├── app/
│   │   │   ├── models.ts            # 类型 + 5 科目 14 组 60 题 题库
│   │   │   ├── services/
│   │   │   │   ├── state.service.ts # 游戏逻辑（菜地/鱼塘/牧场/学习）
│   │   │   │   ├── asset.service.ts # ★ v30 资源加载服务（GLTFLoader + TextureLoader）
│   │   │   │   ├── auth.service.ts  # JWT 鉴权
│   │   │   │   └── category.service.ts
│   │   │   ├── components/
│   │   │   │   └── scene3d/         # Three.js r128 3D 场景（v30 资源驱动 + 内置回退）
│   │   │   ├── app.component.*      # 外壳 + 6 模块导航
│   │   │   └── app.config.ts
│   │   └── ...
│   └── out-tsc/                      # ngc 编译产物（与 src 对应）
│
└── pet-park-server/                  # Spring Boot 3 后端
    ├── pom.xml                       # Spring Boot 3.3.5 + MyBatis-Plus 3.5.7 + jjwt 0.12.6
    ├── mvn-run.ps1                   # PowerShell Maven 封装
    ├── target/
    │   └── pet-park-server-1.0.0.jar # 32MB fat jar（v22 构建，含旧 7 题示例）
    └── src/main/
        ├── java/com/petpark/         # 28 个 Java 源文件
        │   ├── PetParkApplication.java
        │   ├── config/              # SecurityConfig + JwtAuthFilter
        │   ├── controller/          # Auth/State/Category/Question/Log
        │   ├── service/             # User/State/Token
        │   ├── entity/              # 5 表实体
        │   ├── mapper/              # 5 Mapper
        │   ├── dto/                 # 4 DTO
        │   └── common/              # Result + BizException + Handler
        └── resources/
            ├── application.yml       # 端口/数据源/JWT/CORS
            └── schema.sql            # ★ 60 题完整题库 + 19 类目 + 5 表
```

---

## 🚀 快速启动

### ① 单文件版（最简单，零依赖）
直接双击打开 `pet-park/index.html`，浏览器即可玩。
- 所有数据保存在浏览器 localStorage（`wb_petpark_v7`）
- 首屏「数据管理」可导出/导入 JSON 备份
- 离线可用，不需任何后端
- **本版本已移除所有后端对接兜底代码**：单文件版是纯本地模式，不再尝试连接 API

### ② Angular 前端 + Spring Boot 后端（完整体验）

#### 步骤 A：初始化 MySQL
```bash
# 假设 MySQL 5.7 已启动，端口 3306，用户 root 密码 123456
mysql -uroot -p123456 < pet-park/pet-park-server/src/main/resources/schema.sql
```
> schema.sql 含 5 张表 + 19 类目 + **60 题**（英语 15 / 数学 15 / 汉字 10 / 成语 10 / 思维 10）
> 已包含 `CREATE DATABASE` 语句（如果需要）

#### 步骤 B：启动后端
```bash
cd pet-park/pet-park-server
java -jar target/pet-park-server-1.0.0.jar
```
后端监听 `http://127.0.0.1:8080`，API 路径 `/api/*`

> ⚠️ 当前 jar 是 v22 构建版本，内嵌 7 题示例。**重新构建**后才会含完整 60 题（见下方）

#### 步骤 C：启动 Angular 前端
```bash
cd pet-park/pet-park-ng
npm install
npm start
```
前端监听 `http://localhost:4200`，所有 `/api/*` 自动代理到 8080（无需在前端暴露后端地址）

#### 步骤 D：替换 3D 模型（可选，v30）
把 `.glb` / `.gltf` 文件放进 `pet-park-ng/public/assets/models/` 目录
（如 `house.glb`、`tree.glb`、`chicken.glb`、`goldfish.glb` 等）

然后编辑 `public/assets/scene.config.json` 填模型路径 + 位置 + 缩放。

详细说明见 `pet-park-ng/public/assets/README.md`。模型文件不存在会自动回退内置几何体（不报错）。

---

## 🔨 重新构建后端 jar（含 60 题完整题库）

沙箱环境无法完整构建 jar，请在本地执行：
```bash
cd pet-park/pet-park-server
.\mvn-run.ps1 -Goal "clean package -DskipTests"
# 或：
mvn clean package -DskipTests
```
完成后 `target/pet-park-server-1.0.0.jar` 即含 60 题题库。

---

## 🎮 功能清单

### 单文件 HTML 版（独立）
- ✅ 家园 3D 场景（Three.js r128 + OrbitControls）
- ✅ 宠物（喂食 / 陪玩 / 看护 / 出门玩 / 生病喂药）
- ✅ 菜地（4 类植物 · 3 级升级 · 浇水 / 收获）
- ✅ 鱼塘（4 种鱼 · 3 级升级 · 喂食 / 出售）
- ✅ 牧场（鸡鸭牛 · 产出冷却防刷金 · 喂养 / 收集 / 出售）
- ✅ 学习（五科目多题型：英语/数学/汉字/成语/思维，choice/fill/qa/card）
- ✅ 数据管理（导出 / 导入 / 清空 / 恢复示例 / 线下积分导入）
- ✅ 移动端适配（44×44px 按钮 / 16px 输入框 / 底部安全区）

### Angular 前端版
- ✅ 上述全部模块（6 标签页：家园/菜地/鱼塘/牧场/学习/数据）
- ✅ JWT 注册 / 登录（`/api/auth/register|login`）
- ✅ 云端存档（`/api/state` PUT/GET 节流同步）
- ✅ 题库动态拉取（`/api/questions?subject=...`）
- ✅ 类目表动态加载（`/api/categories`）
- ✅ 离线兜底（未连后端时用内置 DEFAULT_CATEGORIES + STUDY_SUBJECTS）
- ✅ Three.js 3D 场景 + OrbitControls

### Spring Boot 后端
- ✅ JWT 鉴权（jjwt 0.12.6 + BCrypt）
- ✅ 5 表 CRUD（users/players/logs/categories/questions）
- ✅ 19 类目种子数据（植物/鱼/动物/家具）
- ✅ 60 题题库（v26 schema.sql 五科目多题型）
- ✅ CORS（已配置 4200/8899 端口）
- ✅ 统一响应格式 `Result<T> {code,msg,data}`
- ✅ 全局异常处理

---

## 🌐 API 接口

| 接口 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/api/auth/register` | POST | 否 | 注册（username+password≥6位+nickname） |
| `/api/auth/login` | POST | 否 | 登录，返回 token |
| `/api/state` | GET | 是 | 拉取当前用户存档 |
| `/api/state` | PUT | 是 | 推送存档 `{version, stateJson}` |
| `/api/categories` | GET | 否 | 类目表（19 条） |
| `/api/questions` | GET | 否 | 题库列表，可选 `?subject=english/math/hanzi/chengyu/thinking` |
| `/api/logs` | POST | 是 | 写日志 |

所有响应：`{"code":0,"msg":"","data":...}`，鉴权头：`Authorization: Bearer <token>`

---

## 📝 版本演进（关键节点）

- **v1-v16**：宠物乐园核心玩法（菜地/鱼塘/宠物/天气）
- **v17-v20**：宠物导航系统修复（A* + 沿墙滑行 + 回家状态机）
- **v21**：类目表统一 + 牧场系统（产出冷却）
- **v22**：Spring Boot 3 后端 + MySQL schema + JWT 鉴权
- **v23**：Angular 19 前端 + proxy 代理
- **v25**：沙箱内 Angular 手动构建链打通（ngc + esbuild + JIT + Temp）
- **v26**（**当前**）：
  - ✅ 单文件 HTML 版清理后端对接兜底代码（纯本地模式）
  - ✅ 学习模块升级为 5 科目 60 题多题型（前端 + 后端 schema）
  - ✅ Angular 前端学习模块完整实现（替换原「开发中」占位）
  - ✅ 端到端链路验证（Angular 19003 代理 → 后端 8080 → MySQL）
  - ✅ 沙箱内完整跑通：科目 Tab / 选择题 / 填空题 / 答题反馈 / 答对判定

---

## 🛠️ 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 前端框架 | Angular standalone + CommonModule | 19.2.25 |
| 3D | Three.js + OrbitControls | 0.128.0 |
| 后端 | Spring Boot + MyBatis-Plus + jjwt | 3.3.5 / 3.5.7 / 0.12.6 |
| 数据库 | MySQL（utf8mb4_unicode_ci） | 5.7 |
| 构建 | Maven + ngc + esbuild | 3.9.12 / Angular CLI |

---

## ⚠️ 注意事项

1. **MySQL 编码**：`application.yml` 用 `characterEncoding=UTF-8`（不是 utf8mb4），配合 `connectionCollation=utf8mb4_unicode_ci` 才能正常创建中文表
2. **JWT 密钥**：默认配置仅供开发，生产环境务必修改 `petpark.jwt.secret` 为至少 32 字节强随机串
3. **CORS**：默认只允许 `http://localhost:8899` 与 `http://127.0.0.1:8899`；Angular ng serve 默认 4200，需要在 `application.yml` 添加或修改 origin
4. **宠物 3D 导航**：Angular 版的 3D 场景目前是基础版（房子/菜地/鱼塘/浮动宠物 + OrbitControls），单文件版的完整 A* 寻路 + 沿墙滑行 + 回家状态机待迁移
5. **离线兜底**：Angular 前端内置 `DEFAULT_CATEGORIES`（19 条类目）和 `STUDY_SUBJECTS`（5 科目 14 组题库），即使后端不可达也能完整运行本地模式

---

## 📞 测试验证

v26 已完成全链路验证（沙箱内）：
- ✅ 单文件版：JS 语法 OK · WORD_GROUPS 0 残留 · 后端对接代码 0 残留 · 关键游戏函数全在
- ✅ Angular 版：ngc + esbuild + JIT 编译通过 · Playwright 实测所有模块渲染 + 学习答题正确
- ✅ 后端：8080 启动 OK · `/api/categories` 19 条 · `/api/questions` 题型完整 · JWT 403 验证
- ✅ 端到端：Angular 19003 代理 → 8080 后端 · 注册/答题/数据模块全部 OK · 无 page error

---

## 🚀 生产部署记录（v32 · 2026-08-06 上线）

### 部署形态：jar 直跑（绕开 Docker）

> **背景**：阿里云 ECS 到 Docker Hub 国际链路被墙（`dial tcp registry-1.docker.io:443: i/o timeout`），
> docker compose 构建拉不到基础镜像，故采用 **jar 直跑 + Nginx** 方案，全部依赖走国内源。

### 生产环境信息

| 项 | 值 |
|----|-----|
| 服务器 | 阿里云 ECS `iZbp18sfxjpmt9coe7oznbZ`（宝塔面板） |
| 公网 IP | `118.31.124.251` |
| 前端入口 | `http://118.31.124.251`（Nginx 80 端口，Angular production 包） |
| 后端 | `java -jar app.jar`（Spring Boot 3.3.5，端口 8080，nohup 后台） |
| 数据库 | 宝塔 MySQL 5.7.44（`127.0.0.1:3306`，库 `pet_park`） |
| MySQL 账号 | root / `83458848de46385e`（生产密码） |
| 部署目录 | `/www/wwwroot/pet`（dist 静态文件 + app.jar + deploy-direct.sh） |
| Nginx 配置 | `/www/server/panel/vhost/nginx/pet-park.conf`（80 + /api 反代 8080） |
| 数据量 | 19 类目 + **60 题**题库（五科目：英语15/数学15/汉字10/成语10/思维10） |

### 部署步骤（jar 直跑）

```bash
# ① 本机构建（已有 jar + dist 时跳过）
cd pet-park-server && mvn clean package -DskipTests
cd ../pet-park-ng && npm run build -- --configuration production

# ② 打包部署目录
#   app.jar + dist/ + mysql/init.sql + deploy-direct.sh + README_DEPLOY.md
#   → pet-direct.zip（28MB）

# ③ 服务器上传解压 + 一键部署
scp pet-direct.zip root@118.31.124.251:/www/wwwroot/pet/
cd /www/wwwroot/pet && unzip -o pet-direct.zip
bash deploy-direct.sh        # 自动：JDK17 → MySQL 检查 → init.sql → 起后端 → Nginx
```

### 关键运维命令

```bash
# 后端日志 / 重启
tail -50 /www/wwwroot/pet/backend.log
pkill -f pet-park-server && cd /www/wwwroot/pet && nohup java -jar app.jar --server.port=8080 > backend.log 2>&1 &

# 数据库备份（宝塔计划任务）
mysqldump -uroot -p'83458848de46385e' pet_park > pet_park_$(date +%Y%m%d).sql

# Nginx 重载
nginx -t && nginx -s reload
```

### 踩坑记录（v32 部署期）

1. **Docker 被墙**：ECS 到 Docker Hub 不通，镜像加速器对 BuildKit 无效 → 放弃 Docker，改 jar 直跑
2. **nginx 配置放错位置**：宝塔只 include `/www/server/panel/vhost/nginx/*.conf`，放 `/www/server/nginx/conf/` 不生效 → 移到 vhost 目录 + `listen 80 default_server`
3. **root 路径错位**：部署脚本 WEB_ROOT 写 `pet-park`，实际目录是 `/www/wwwroot/pet` → 修正
4. **init.sql 幂等化**：questions 表缺唯一索引导致重复执行题库翻倍（60→120）→ 加 `UNIQUE KEY (subject, group_id, prompt(200))` + INSERT 前 DELETE，实测连续执行 3 次恒为 19/60
5. **curl 127.0.0.1 假 404**：宝塔 phpfpm_status.conf 抢 `server_name 127.0.0.1`，本地 curl 测 /api 会 404；浏览器走公网 IP 正常。验证请带 `-H "Host: 118.31.124.251"`
6. **MySQL 版本注意**：宝塔 MySQL 5.7 手动初始化必须 `--default-character-set=utf8mb4`，否则中文报 `Data too long`

### 安全提醒

- ⚠️ 生产 MySQL root 密码已改（`83458848de46385e`），请定期更换并备份
- ⚠️ 8080 后端端口未对公网开放（仅 Nginx 反代内网访问），安全组只开 80
- ⚠️ JWT 密钥 `petpark.jwt.secret` 生产已用随机 64 字符（部署脚本内置），如需更换：`openssl rand -hex 32`
- ⚠️ 服务器重启后后端需手动拉起 → 建议宝塔「计划任务 → 开机执行」：`cd /www/wwwroot/pet && nohup java -jar app.jar --server.port=8080 > backend.log 2>&1 &`