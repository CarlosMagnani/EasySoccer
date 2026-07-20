[CmdletBinding()]
param(
    [switch]$SkipPipUpgrade,
    [string]$PythonExecutable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvDirectory = Join-Path $packageRoot '.venv'
$venvPython = Join-Path $venvDirectory 'Scripts\python.exe'
$requirementsFile = Join-Path $packageRoot 'requirements.txt'

function Find-SupportedPython {
    if (-not [string]::IsNullOrWhiteSpace($PythonExecutable)) {
        if (-not (Test-Path -LiteralPath $PythonExecutable -PathType Leaf)) {
            throw "Python informado não encontrado: $PythonExecutable"
        }

        $resolvedPython = (Resolve-Path -LiteralPath $PythonExecutable).Path
        & $resolvedPython -c "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)" 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw 'O Python informado precisa ser versão 3.10, 3.11 ou 3.12.'
        }

        return [PSCustomObject]@{
            Executable = $resolvedPython
            Arguments  = @()
            Label      = $resolvedPython
        }
    }

    $pyLauncher = Get-Command 'py' -ErrorAction SilentlyContinue

    if ($null -ne $pyLauncher) {
        foreach ($version in @('3.12', '3.11', '3.10')) {
            & $pyLauncher.Source "-$version" -c "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)" 2>$null
            if ($LASTEXITCODE -eq 0) {
                return [PSCustomObject]@{
                    Executable = $pyLauncher.Source
                    Arguments  = @("-$version")
                    Label      = "Python $version via py.exe"
                }
            }
        }
    }

    foreach ($commandName in @('python', 'python3')) {
        $pythonCommand = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($null -eq $pythonCommand) {
            continue
        }

        & $pythonCommand.Source -c "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            return [PSCustomObject]@{
                Executable = $pythonCommand.Source
                Arguments  = @()
                Label      = $pythonCommand.Source
            }
        }
    }

    $userProfileDirectory = [Environment]::GetFolderPath('UserProfile')
    if (-not [string]::IsNullOrWhiteSpace($userProfileDirectory)) {
        $codexPython = Join-Path $userProfileDirectory '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
        if (Test-Path -LiteralPath $codexPython -PathType Leaf) {
            & $codexPython -c "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)" 2>$null
            if ($LASTEXITCODE -eq 0) {
                return [PSCustomObject]@{
                    Executable = $codexPython
                    Arguments  = @()
                    Label      = 'Python 3 do runtime local do Codex'
                }
            }
        }
    }

    throw 'Python compatível não encontrado. Instale o Python 3.10, 3.11 ou 3.12 (64 bits) ou execute novamente com -PythonExecutable C:\caminho\python.exe.'
}

if (-not (Test-Path -LiteralPath $requirementsFile -PathType Leaf)) {
    throw "Arquivo não encontrado: $requirementsFile"
}

Set-Location -LiteralPath $packageRoot

if (Test-Path -LiteralPath $venvPython -PathType Leaf) {
    & $venvPython -c "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)"
    if ($LASTEXITCODE -ne 0) {
        throw 'A pasta .venv existente usa uma versão incompatível do Python. Renomeie ou remova apenas essa pasta e execute INSTALL.ps1 novamente.'
    }
    Write-Host 'Ambiente virtual .venv já existe e será reutilizado.' -ForegroundColor Yellow
}
else {
    $python = Find-SupportedPython
    $pythonArguments = @($python.Arguments)
    Write-Host "Criando .venv com $($python.Label)..." -ForegroundColor Cyan
    & $python.Executable @pythonArguments -m venv $venvDirectory
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
        throw 'Não foi possível criar o ambiente virtual .venv.'
    }
}

if (-not $SkipPipUpgrade) {
    Write-Host 'Atualizando o pip dentro da .venv...' -ForegroundColor Cyan
    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao atualizar o pip.'
    }
}

Write-Host 'Instalando as dependências do backend...' -ForegroundColor Cyan
& $venvPython -m pip install -r $requirementsFile
if ($LASTEXITCODE -ne 0) {
    throw 'Falha ao instalar requirements.txt.'
}

Write-Host 'Verificando as dependências...' -ForegroundColor Cyan
& $venvPython -c "import fastapi, uvicorn, ortools, pandas; print('Dependencias verificadas com sucesso.')"
if ($LASTEXITCODE -ne 0) {
    throw 'Uma ou mais dependências não puderam ser importadas.'
}

Write-Host ''
Write-Host 'Instalação concluída.' -ForegroundColor Green
Write-Host 'Próximo passo: .\START_BACKEND.ps1'
Write-Host 'Depois, importe tampermonkey-ai-sbc.user.js no Tampermonkey conforme README_LOCAL.md.'
