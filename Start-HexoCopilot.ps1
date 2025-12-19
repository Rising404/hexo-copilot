# Hexo Copilot 启动脚本 (PowerShell)
$Host.UI.RawUI.WindowTitle = "Hexo Copilot"
Set-Location $PSScriptRoot
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   🚀 Hexo Copilot 正在启动..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 首次运行，正在安装依赖..." -ForegroundColor Yellow
    npm install
}

# 检查 Python 虚拟环境
if (-not (Test-Path ".venv")) {
    Write-Host "🐍 创建 Python 虚拟环境..." -ForegroundColor Yellow
    python -m venv .venv
    Write-Host "📦 安装 Python 依赖..." -ForegroundColor Yellow
    & ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
}

Write-Host ""
Write-Host "✅ 启动前端 (Vite) 和后端 (FastAPI)..." -ForegroundColor Green
Write-Host "   前端地址: " -NoNewline; Write-Host "http://localhost:5173" -ForegroundColor Blue
Write-Host "   后端地址: " -NoNewline; Write-Host "http://localhost:8000" -ForegroundColor Blue
Write-Host ""
Write-Host "💡 按 Ctrl+C 停止所有服务" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

npm start
