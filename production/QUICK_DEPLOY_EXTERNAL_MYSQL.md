# 宠物乐园 · 生产部署快速指南（复用宝塔 MySQL 版）

> 适用：服务器已有 MySQL（宝塔面板 3306，root / Bt@Mysql2026!）
> Docker 只打包运行 backend + frontend，数据库用宝塔现有的

## 一、上传部署包到服务器

```bash
# 本机上传（把 pet-deploy.zip 传到服务器 /opt 下）
scp pet-deploy.zip root@服务器IP:/opt/
```

## 二、服务器解压 + 初始化数据库

```bash
cd /opt
unzip pet-deploy.zip -d pet-park
cd pet-park

# ① 初始化数据库（宝塔 MySQL 已在 3306 运行）
mysql -uroot -p --default-character-set=utf8mb4 < production/init.sql
# 输入密码：Bt@Mysql2026!

# ② 验证 60 题完整
mysql -uroot -p --default-character-set=utf8mb4 -e "
USE pet_park; SELECT COUNT(*) FROM categories; SELECT subject,COUNT(*) FROM questions GROUP BY subject;"
```

## 三、配置环境变量

```bash
cp production/.env.production .env
vi .env
```

**关键项：**
- `DB_HOST`：**必须改**。Docker 容器访问宿主机 MySQL：
  - 宝塔 Docker 通常用 **172.17.0.1**（docker0 网关）
  - 或宿主机内网 IP（`ip addr` 查 eth0）
  - 或 `host.docker.internal`（Docker 20.10+ Linux 需 `--add-host` 才支持，推荐直接用 172.17.0.1）
- `DB_USER=root` / `MYSQL_ROOT_PASSWORD="Bt@Mysql2026!"` 已配好
- `JWT_SECRET` 已生成随机值，可直接用

## 四、构建 + 启动

```bash
# 复用外部 MySQL 版（推荐）
docker compose -f docker-compose.external-mysql.yml up -d --build

# 首次构建 3-8 分钟（拉基础镜像 + Maven 打包 + npm 构建）
```

## 五、验证

```bash
curl http://localhost:8081/api/categories        # 应返回 19 条类目 JSON
curl -X POST http://localhost:8081/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"testuser1","password":"123456"}'   # 返回 token
```

浏览器访问：`http://服务器IP:8081`

## ⚠️ 关键注意事项

1. **MySQL 远程连接**：宝塔 MySQL 默认只监听 127.0.0.1，Docker 容器连不上。
   需在宝塔面板 → 数据库 → root → 权限，允许远程/指定 IP 访问；
   或 MySQL 配置 `bind-address=0.0.0.0` 后重启（注意安全组/防火墙）
2. **DB_HOST 测试**：启动前可在服务器执行 `docker run --rm curlimages/curl curl 172.17.0.1:3306` 确认可达
3. **端口冲突**：`FRONTEND_PORT=8081` 若被占，改 .env 后 `docker compose ... up -d` 重新生效
4. **完整版**：如果想 Docker 连 MySQL 一起跑（不依赖宝塔 MySQL），用默认 `docker-compose.yml`：
   `docker compose up -d --build`（MySQL 走 3307 端口，密码默认 123456，可改 .env）
5. **备份**：宝塔面板可定时备份 MySQL；生产建议给后端 8082 不做公网映射
