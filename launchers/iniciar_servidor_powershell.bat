@echo off
chcp 65001 >nul
echo Iniciando servidor local (PowerShell) Leitor VLibras...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\servers\servidor.ps1"
pause
