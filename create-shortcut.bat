@echo off
setlocal EnableDelayedExpansion

:: 获取当前目录
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

:: 设置变量（使用英文文件名避免编码问题）
set "BAT_FILE=%APP_DIR%\start-app.bat"
set "ICON_FILE=%APP_DIR%\app.ico"

:: 检查启动脚本是否存在
if not exist "%BAT_FILE%" (
    echo Error: start-app.bat not found
    pause
    exit /b 1
)

:: 创建 VBS 脚本
set "VBS_FILE=%TEMP%\hexo_shortcut_%RANDOM%.vbs"

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_FILE%"
echo strDesktop = WshShell.SpecialFolders("Desktop") >> "%VBS_FILE%"
echo Set shortcut = WshShell.CreateShortcut(strDesktop ^& "\Hexo Copilot.lnk") >> "%VBS_FILE%"
echo shortcut.TargetPath = "%BAT_FILE%" >> "%VBS_FILE%"
echo shortcut.WorkingDirectory = "%APP_DIR%" >> "%VBS_FILE%"
echo shortcut.Description = "Hexo Copilot" >> "%VBS_FILE%"
echo shortcut.WindowStyle = 1 >> "%VBS_FILE%"

:: 如果有自定义图标则使用
if exist "%ICON_FILE%" (
    echo shortcut.IconLocation = "%ICON_FILE%, 0" >> "%VBS_FILE%"
) else (
    echo shortcut.IconLocation = "shell32.dll, 14" >> "%VBS_FILE%"
)

echo shortcut.Save >> "%VBS_FILE%"
echo WScript.Echo "OK" >> "%VBS_FILE%"

:: 执行 VBS 脚本
for /f "delims=" %%i in ('cscript //nologo "%VBS_FILE%"') do set "RESULT=%%i"
del "%VBS_FILE%" 2>nul

if "%RESULT%"=="OK" (
    echo Desktop shortcut created successfully!
    echo Double-click "Hexo Copilot" on desktop to start.
) else (
    echo Failed. Opening folder for manual creation...
    explorer "%APP_DIR%"
)

pause
