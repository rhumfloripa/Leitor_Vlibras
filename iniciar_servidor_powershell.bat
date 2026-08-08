@echo off
chcp 65001 >nul
echo Iniciando servidor local (PowerShell) Vimeo + VLibras...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
pause
