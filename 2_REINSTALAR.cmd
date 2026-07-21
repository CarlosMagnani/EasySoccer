@echo off
setlocal
cd /d "%~dp0"
title EasySoccer - Reinstalar

echo ============================================================
echo  EasySoccer - Reinstalacao limpa
echo ============================================================
echo.
echo Este atalho remove somente a pasta .venv e instala novamente.
echo O codigo, as configuracoes do Tampermonkey e seus arquivos
echo pessoais nao serao removidos.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0REINSTALL.ps1"
if errorlevel 1 (
    echo.
    echo A reinstalacao falhou. Leia o erro acima antes de fechar.
    pause
    exit /b 1
)

echo.
echo Reinstalacao concluida. Agora use 3_INICIAR_PROJETO.cmd.
pause
