@echo off
chcp 65001 >nul
echo Iniciando servidor local Vimeo + VLibras...
echo.
python "%~dp0servidor.py"
pause
