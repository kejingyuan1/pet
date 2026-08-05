# ============================================================
# 宠物乐园 一键部署脚本（Windows PowerShell，兼容 PS 5.1+）
# 用法：
#   .\deploy.ps1            # 一键打包 + 部署运行
#   .\deploy.ps1 -OnlyUp    # 只启动（不重新构建）
#   .\deploy.ps1 -Down      # 停止并删除容器
#   .\deploy.ps1 -Logs      # 查看日志
#   .\deploy.ps1 -Reset     # 彻底重置（删容器+数据卷，重建）
# ============================================================
param(
    [switch]$OnlyUp,
    [switch]$Down,
    [switch]$Logs,
    [switch]$Reset
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 读取 .env 或默认端口（兼容 PS 5.1，不用三元运算符）
function Get-Port([string]$key, [string]$def) {
    $v = [Environment]::GetEnvironmentVariable($key)
    if ([string]::IsNullOrEmpty($v)) { return $def }
    return $v
}
$FRONTEND_PORT = Get-Port "FRONTEND_PORT" "8081"
$BACKEND_PORT  = Get-Port "BACKEND_PORT" "8082"
$MYSQL_PORT    = Get-Port "MYSQL_PORT" "3307"
$MYSQL_PWD     = Get-Port "MYSQL_ROOT_PASSWORD" "123456"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   宠物乐园 Docker 一键部署" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 0. 检查 docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未找到 Docker，请先安装 Docker Desktop" -ForegroundColor Red
    exit 1
}
if (-not (docker info 2>$null | Select-String "Server Version")) {
    Write-Host "[错误] Docker 未启动，请先打开 Docker Desktop" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Docker 可用" -ForegroundColor Green

# 1. 停止/删除
if ($Down) {
    Write-Host "[1/3] 停止并删除容器..." -ForegroundColor Yellow
    docker compose down
    Write-Host "[完成] 已停止" -ForegroundColor Green
    exit 0
}

# 2. 看日志
if ($Logs) {
    docker compose logs -f --tail=100
    exit 0
}

# 3. 重置（删数据卷）
if ($Reset) {
    Write-Host "[重置] 删除容器 + 数据卷..." -ForegroundColor Yellow
    docker compose down -v
    Write-Host "[完成] 已重置，开始重新部署..." -ForegroundColor Green
}

# 4. 构建 + 启动
if ($OnlyUp) {
    Write-Host "[2/3] 启动容器（不重建）..." -ForegroundColor Yellow
    docker compose up -d
} else {
    Write-Host "[2/3] 一键打包 + 部署（首次构建需 3-8 分钟）..." -ForegroundColor Yellow
    docker compose up -d --build
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 部署失败，查看日志：.\deploy.ps1 -Logs" -ForegroundColor Red
    exit 1
}

# 5. 等待健康检查
Write-Host "[3/3] 等待服务启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 8
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$FRONTEND_PORT/api/categories" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if ($ready) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "   ✅ 部署成功！" -ForegroundColor Green
    Write-Host "   前端入口：http://localhost:$FRONTEND_PORT" -ForegroundColor Green
    Write-Host "   后端 API：http://localhost:$BACKEND_PORT/api" -ForegroundColor Green
    Write-Host "   MySQL 端口：$MYSQL_PORT（root/$MYSQL_PWD）" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  常用命令：" -ForegroundColor Gray
    Write-Host "    .\deploy.ps1 -Logs    查看日志" -ForegroundColor Gray
    Write-Host "    .\deploy.ps1 -Down    停止服务" -ForegroundColor Gray
    Write-Host "    .\deploy.ps1 -OnlyUp  重新启动" -ForegroundColor Gray
    Write-Host "    .\deploy.ps1 -Reset   重置数据重新部署" -ForegroundColor Gray
} else {
    Write-Host "[警告] 服务启动较慢，等待 30 秒后再试：.\deploy.ps1 -Logs" -ForegroundColor Yellow
}
