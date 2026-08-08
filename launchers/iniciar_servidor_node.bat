@echo off
chcp 65001 >nul
echo Iniciando servidor local (Node.js) Leitor VLibras...
echo.
node "%~dp0..\servers\servidor.js"
pause
