# ============================================================
# 宠物乐园 一键部署脚本（Linux / macOS / Git Bash）
# 用法：
#   ./deploy.sh              # 一键打包 + 部署运行
#   ./deploy.sh --up         # 只启动（不重新构建）
#   ./deploy.sh --down       # 停止并删除容器
#   ./deploy.sh --logs       # 查看日志
#   ./deploy.sh --reset      # 彻底重置（删容器+数据卷，重建）
# ============================================================
set -e

cd "$(dirname "$0")"

echo ""
echo "============================================"
echo "   宠物乐园 Docker 一键部署"
echo "============================================"

# 0. 检查 docker
if ! command -v docker >/dev/null 2>&1; then
    echo "[错误] 未找到 Docker，请先安装" >&2
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    echo "[错误] Docker 未启动（daemon 不可达），请先启动 Docker" >&2
    exit 1
fi
echo "[OK] Docker 可用"

# 参数解析
case "${1:-}" in
    --up)
        echo "[1/2] 启动容器（不重建）..."
        docker compose up -d
        ;;
    --down)
        echo "[1/1] 停止并删除容器..."
        docker compose down
        echo "[完成] 已停止"
        exit 0
        ;;
    --logs)
        docker compose logs -f --tail=100
        exit 0
        ;;
    --reset)
        echo "[重置] 删除容器 + 数据卷..."
        docker compose down -v
        echo "[完成] 已重置，开始重新部署..."
        echo "[2/2] 一键打包 + 部署（首次构建需 3-8 分钟）..."
        docker compose up -d --build
        ;;
    *)
        echo "[1/2] 一键打包 + 部署（首次构建需 3-8 分钟）..."
        docker compose up -d --build
        ;;
esac

# 2. 等待健康检查
echo "[2/2] 等待服务启动..."
sleep 8
FRONTEND_PORT="${FRONTEND_PORT:-8081}"
BACKEND_PORT="${BACKEND_PORT:-8082}"
MYSQL_PORT="${MYSQL_PORT:-3307}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-123456}"

ready=false
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${FRONTEND_PORT}/api/categories" >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 2
done

echo ""
echo "============================================"
if [ "$ready" = true ]; then
    echo "   ✅ 部署成功！"
    echo "   前端入口：http://localhost:${FRONTEND_PORT}"
    echo "   后端 API：http://localhost:${BACKEND_PORT}/api"
    echo "   MySQL 端口：${MYSQL_PORT}（root/${MYSQL_ROOT_PASSWORD}）"
else
    echo "   [警告] 服务启动较慢，30 秒后未就绪"
    echo "   查看日志：./deploy.sh --logs"
fi
echo "============================================"
echo ""
echo "  常用命令："
echo "    ./deploy.sh --logs    查看日志"
echo "    ./deploy.sh --down    停止服务"
echo "    ./deploy.sh --up      重新启动"
echo "    ./deploy.sh --reset   重置数据重新部署"
