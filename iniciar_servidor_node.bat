@echo off
chcp 65001 >nul
echo Iniciando servidor local (Node.js) Vimeo + VLibras...
echo.
node "%~dp0servidor.js"
pause
