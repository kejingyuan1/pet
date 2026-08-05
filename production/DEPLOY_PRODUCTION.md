# 宠物乐园 · 生产环境部署指南

> 目标：在**有 Docker 的服务器**上部署「我的宠物乐园」完整版（MySQL + Spring Boot + Angular/Nginx）
> 本文档为生产发布版本，已包含初始化 SQL、环境变量模板与安全配置说明

---

## 0. 部署资产清单

| 文件 | 作用 |
|------|------|
| `production/init.sql` | **MySQL 初始化语句**（建库 + 5 表 + 19 类目 + 60 题题库） |
| `production/.env.production` | 生产环境变量模板（**复制为 `.env` 后必须改密码/密钥**） |
| `docker-compose.yml` | 三服务编排（mysql + backend + frontend） |
| `deploy.sh`（Linux/macOS）/ `deploy.ps1`（Windows） | 一键部署脚本 |

---

## 1. 服务器前置条件

```bash
# 确认 Docker 已安装并运行
docker --version          # Docker 20.10+
docker compose version    # compose v2
```

> ⚠️ 本机（开发机）不需要装 Docker Desktop 即可交付——**部署在生产服务器上执行**。
> 若本机需要验证镜像构建，安装 Docker Desktop 后 `docker compose build` 即可。

---

## 2. 部署步骤

### 步骤 A：上传项目到服务器

把整个 `pet/` 目录上传到服务器（scp / git clone / rsync 均可）：

```bash
scp -r pet/ user@server:/opt/pet-park/
cd /opt/pet-park/
```

### 步骤 B：配置生产环境变量

```bash
# 1. 复制模板
cp production/.env.production .env

# 2. ⚠️ 修改 .env —— 必须改的 3 项：
#    MYSQL_ROOT_PASSWORD：数据库强密码
#    JWT_SECRET：JWT 签名密钥（至少 32 字节随机串）
#    FRONTEND_PORT：公网访问端口（或用 80）
openssl rand -base64 24   # 生成 MySQL 密码
openssl rand -hex 32      # 生成 JWT 密钥
```

### 步骤 C：一键构建 + 启动

```bash
./deploy.sh               # 首次构建 3-8 分钟（拉镜像 + Maven + npm）
```

### 步骤 D：验证

```bash
# 健康检查（脚本会自动等待）
curl http://localhost:8081/api/categories    # 应返回 19 条类目 JSON

# 浏览器访问
#   http://服务器IP:8081
```

---

## 3. MySQL 初始化语句（两种方式）

### 方式 ① Docker 自动初始化（推荐，零操作）

`docker-compose.yml` 已把 `production/init.sql`（即 `pet-park-server/src/main/resources/schema.sql`）
挂载到 MySQL 容器的 `/docker-entrypoint-initdb.d/`：

```yaml
volumes:
  - ./pet-park-server/src/main/resources/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
```

**MySQL 容器首次启动时自动执行**：建库 `pet_park` + 5 张表 + 19 类目 + 60 题。
（`mysql-data` 数据卷已初始化后，后续重启不再重复执行）

### 方式 ② 手动初始化（已有 MySQL / 外部数据库时）

```bash
mysql -uroot -p --default-character-set=utf8mb4 < production/init.sql
```

> ⚠️ **必须加 `--default-character-set=utf8mb4`**！否则 Windows/Linux 客户端默认字符集
> 非 utf8mb4 时，中文（如「胡萝卜」）会报 `Data too long for column 'name'`。

---

## 4. 初始化 SQL 内容摘要（`production/init.sql`）

| 内容 | 明细 |
|------|------|
| 数据库 | `pet_park`（utf8mb4 / utf8mb4_unicode_ci） |
| 表 1 `users` | 用户表：username/password(BCrypt)/nickname |
| 表 2 `players` | 玩家存档：state_json(JSON)/version |
| 表 3 `logs` | 事件日志 |
| 表 4 `categories` | **19 条类目**：胡萝卜/番茄/草莓/西瓜/小鱼/金鱼/锦鲤/龙鱼/鸡/鸭/牛/床/沙发/桌子/花盆/地毯/台灯/书架/电视 |
| 表 5 `questions` | **60 题题库**：英语 15 + 数学 15 + 汉字 10 + 成语 10 + 思维 10 |

---

## 5. 生产安全加固清单

| 项 | 说明 |
|----|------|
| ⚠️ MySQL 密码 | 默认 `123456` 必须改（`.env` 的 `MYSQL_ROOT_PASSWORD`） |
| ⚠️ JWT 密钥 | 默认值必须改（`.env` 的 `JWT_SECRET`，`openssl rand -hex 32`） |
| ⚠️ MySQL 端口 | `MYSQL_PORT=3307` 生产**不要暴露到公网**（只在内网/防火墙内） |
| ⚠️ 后端端口 | `BACKEND_PORT=8082` 生产**不要暴露到公网**（由 Nginx 反代） |
| MySQL 版本 | 项目基于 `mysql:5.7`（utf8mb4_unicode_ci）；如需 8.0 需验证兼容性 |
| 备份 | 定期备份 MySQL 数据卷：`docker run --rm -v pet-park_mysql-data:/var/lib/mysql -v $(pwd):/backup alpine tar czf /backup/mysql-backup.tar.gz -C /var/lib/mysql .` |
| HTTPS | 生产建议用 Nginx/Caddy 反代 `FRONTEND_PORT` 加 TLS |

---

## 6. 常用运维命令

```bash
./deploy.sh --logs     # 查看日志（-f 跟踪）
./deploy.sh --up       # 只启动（不重建）
./deploy.sh --down     # 停止并删除容器
./deploy.sh --reset    # 彻底重置（删容器+数据卷，重建，重新执行 init.sql）

# 或直接用 docker compose
docker compose ps
docker compose logs -f backend
docker compose down -v   # ⚠️ 会删除数据库数据！
```

---

## 7. 服务架构

```
浏览器 ──► http://服务器:8081 ──► Nginx (frontend)
                                    ├── 静态资源 (Angular dist)
                                    └── /api/* ──► backend:8080 (Spring Boot)
                                                       └── JDBC ──► mysql:3306 (MySQL 5.7)
```
