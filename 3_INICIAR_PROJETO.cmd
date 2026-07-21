@echo off
setlocal
cd /d "%~dp0"
title EasySoccer - Servidor local

echo ============================================================
echo  EasySoccer - Servidor local
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_BACKEND.ps1"
if errorlevel 1 (
    echo.
    echo Nao foi possivel iniciar. Leia o erro acima.
    echo Se o ambiente estiver quebrado, use 2_REINSTALAR.cmd.
    pause
    exit /b 1
)
