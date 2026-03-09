@echo off
REM 在 flownote conda 环境中打包 FlowNote
cd /d "%~dp0"

echo [1/2] Installing PyInstaller...
call conda run -n flownote pip install -q pyinstaller

echo [2/2] Building executable...
call conda run -n flownote pyinstaller --clean --noconfirm FlowNote.spec

if %ERRORLEVEL% equ 0 (
    echo.
    echo Done. Executable: dist\FlowNote.exe
    echo Run: dist\FlowNote.exe
) else (
    echo Build failed.
    exit /b 1
)
