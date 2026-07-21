@echo off
setlocal
cd /d "%~dp0"
title EasySoccer - Instalar do zero

echo ============================================================
echo  EasySoccer - Instalacao inicial
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALL.ps1"
if errorlevel 1 (
    echo.
    echo A instalacao falhou. Leia o erro acima antes de fechar.
    pause
    exit /b 1
)

echo.
echo Instalacao concluida. Agora use 3_INICIAR_PROJETO.cmd.
pause
