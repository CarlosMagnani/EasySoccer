[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $packageRoot '.venv\Scripts\python.exe'
$testedWorkspacePython = [IO.Path]::GetFullPath((Join-Path $packageRoot '..\..\work\autosbc-venv\Scripts\python.exe'))
$backendDirectory = Join-Path $packageRoot 'backend'

if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
    if (Test-Path -LiteralPath $testedWorkspacePython -PathType Leaf) {
        $venvPython = $testedWorkspacePython
        Write-Host 'Usando o ambiente de teste já preparado neste workspace.' -ForegroundColor Yellow
    }
    else {
        throw 'A .venv não foi encontrada. Execute .\INSTALL.ps1 primeiro.'
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $backendDirectory 'main.py') -PathType Leaf)) {
    throw "Backend não encontrado em: $backendDirectory"
}

Set-Location -LiteralPath $packageRoot
$env:PYTHONUNBUFFERED = '1'

Write-Host 'Backend local: http://127.0.0.1:8000' -ForegroundColor Green
Write-Host 'Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.' -ForegroundColor Yellow

& $venvPython -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
if ($LASTEXITCODE -ne 0) {
    throw "O backend terminou com código $LASTEXITCODE. Verifique se a porta 8000 já está em uso e leia o erro acima."
}
