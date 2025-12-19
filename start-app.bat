@echo off
chcp 65001 >nul
title Hexo Copilot
cd /d "%~dp0"

echo ========================================
echo    🚀 Hexo Copilot 正在启动...
echo ========================================
echo.

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo 📦 首次运行，正在安装依赖...
    call npm install
)

:: 检查 Python 虚拟环境
if not exist ".venv" (
    echo 🐍 创建 Python 虚拟环境...
    python -m venv .venv
    echo 📦 安装 Python 依赖...
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
)

echo.
echo ✅ 启动前端 (Vite) 和后端 (FastAPI)...
echo.
echo 💡 按 Ctrl+C 停止所有服务
echo ========================================

:: 延迟3秒后打开浏览器（等待服务启动）
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

call npm start
