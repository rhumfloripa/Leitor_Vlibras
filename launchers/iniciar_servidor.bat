@echo off
chcp 65001 >nul
echo Iniciando servidor local (Python) Leitor VLibras...
echo.
python "%~dp0..\servers\servidor.py"
pause
