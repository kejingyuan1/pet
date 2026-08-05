@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title 宠物乐园 Docker 一键部署

echo ============================================
echo    宠物乐园 Docker 一键重新部署 (Windows)
echo    使用外部 MySQL（宝塔 3306）
echo ============================================
echo.

cd /d "%~dp0"

:: ===== 1. 检查 Docker =====
where docker >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 docker 命令，请先安装 Docker Desktop
    pause
    exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker 未启动，请先打开 Docker Desktop
    pause
    exit /b 1
)
echo [OK] Docker 可用

:: ===== 2. 生成 .env（不存在时从模板复制）=====
if not exist ".env" (
    if exist "production\.env.production" (
        copy /y "production\.env.production" ".env" >nul
        echo [OK] 已生成 .env（来自 production\.env.production）
        echo      请检查 .env 中 DB_HOST / 密码 是否正确
    ) else (
        echo [错误] 缺少 production\.env.production 模板
        pause
        exit /b 1
    )
) else (
    echo [OK] 已存在 .env，沿用现有配置
)

:: ===== 3. 选择 compose 文件 =====
set "COMPOSE_FILE=docker-compose.external-mysql.yml"
if not exist "%COMPOSE_FILE%" (
    set "COMPOSE_FILE=docker-compose.yml"
)
echo [OK] 使用编排文件：%COMPOSE_FILE%

:: ===== 4. 停止旧容器 =====
echo.
echo [1/4] 停止旧容器...
docker compose -f "%COMPOSE_FILE%" down 2>nul
echo [OK] 旧容器已停止

:: ===== 5. 构建 + 启动 =====
echo.
echo [2/4] 构建并启动容器（首次构建 3-8 分钟，请耐心等待）...
docker compose -f "%COMPOSE_FILE%" up -d --build
if errorlevel 1 (
    echo [错误] 部署失败！查看日志：docker compose -f "%COMPOSE_FILE%" logs -f
    pause
    exit /b 1
)
echo [OK] 容器已启动

:: ===== 6. 等待健康检查 =====
echo.
echo [3/4] 等待服务就绪（最多 60 秒）...
set "READY=0"
for /l %%i in (1,1,30) do (
    curl -s -o nul --max-time 3 http://localhost:8081/api/categories 2>nul
    if !errorlevel! equ 0 (
        set "READY=1"
        echo [OK] 服务已就绪（第 %%i 次探测）
        goto :check_done
    )
    timeout /t 2 /nobreak >nul
)
:check_done

:: ===== 7. 结果 =====
echo.
echo ============================================
if "%READY%"=="1" (
    echo   [OK] 部署成功！
    echo   前端入口：http://localhost:8081
    echo   后端 API：http://localhost:8082/api
) else (
    echo   [警告] 服务启动较慢，60 秒内未就绪
    echo   查看日志：docker compose -f "%COMPOSE_FILE%" logs -f
)
echo ============================================
echo.
echo  常用命令：
echo    docker compose -f "%COMPOSE_FILE%" logs -f    查看日志
echo    docker compose -f "%COMPOSE_FILE%" down       停止服务
echo    docker compose -f "%COMPOSE_FILE%" ps         查看状态
echo.
pause
