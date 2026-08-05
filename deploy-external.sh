#!/bin/bash
# ============================================================
# 宠物乐园 Docker 一键重新部署 (Linux / macOS / 宝塔服务器)
# 使用外部 MySQL（宝塔 3306）
# 用法：bash deploy-external.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo ""
echo "============================================"
echo "   宠物乐园 Docker 一键重新部署"
echo "   使用外部 MySQL（宝塔 3306）"
echo "============================================"

# 1. 检查 docker
if ! command -v docker >/dev/null 2>&1; then
    echo "[错误] 未找到 Docker，请先安装" >&2
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    echo "[错误] Docker 未启动（daemon 不可达），请先启动 Docker" >&2
    exit 1
fi
echo "[OK] Docker 可用"

# 2. 生成 .env（不存在时从模板复制）
if [ ! -f ".env" ]; then
    if [ -f "production/.env.production" ]; then
        cp production/.env.production .env
        echo "[OK] 已生成 .env（来自 production/.env.production）"
        echo "     请检查 .env 中 DB_HOST / 密码 是否正确"
    else
        echo "[错误] 缺少 production/.env.production 模板" >&2
        exit 1
    fi
else
    echo "[OK] 已存在 .env，沿用现有配置"
fi

# 3. 选择 compose 文件
COMPOSE_FILE="docker-compose.external-mysql.yml"
[ -f "$COMPOSE_FILE" ] || COMPOSE_FILE="docker-compose.yml"
echo "[OK] 使用编排文件：$COMPOSE_FILE"

# 4. 停止旧容器（忽略错误）
echo ""
echo "[1/4] 停止旧容器..."
docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
echo "[OK] 旧容器已停止"

# 5. 构建 + 启动
echo ""
echo "[2/4] 构建并启动容器（首次构建 3-8 分钟，请耐心等待）..."
docker compose -f "$COMPOSE_FILE" up -d --build
if [ $? -ne 0 ]; then
    echo "[错误] 部署失败！查看日志：docker compose -f $COMPOSE_FILE logs -f" >&2
    exit 1
fi
echo "[OK] 容器已启动"

# 6. 等待健康检查（最多 60 秒）
echo ""
echo "[3/4] 等待服务就绪（最多 60 秒）..."
READY=false
for i in $(seq 1 30); do
    if curl -sf --max-time 3 "http://localhost:8081/api/categories" >/dev/null 2>&1; then
        READY=true
        echo "[OK] 服务已就绪（第 $i 次探测）"
        break
    fi
    sleep 2
done

# 7. 结果
echo ""
echo "============================================"
if [ "$READY" = true ]; then
    echo "  [OK] 部署成功！"
    echo "  前端入口：http://localhost:8081"
    echo "  后端 API：http://localhost:8082/api"
else
    echo "  [警告] 服务启动较慢，60 秒内未就绪"
    echo "  查看日志：docker compose -f $COMPOSE_FILE logs -f"
fi
echo "============================================"
echo ""
echo "  常用命令："
echo "    docker compose -f $COMPOSE_FILE logs -f    查看日志"
echo "    docker compose -f $COMPOSE_FILE down       停止服务"
echo "    docker compose -f $COMPOSE_FILE ps         查看状态"
echo ""
