@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
    py scripts\start.py
) else (
    python scripts\start.py
)
pause
