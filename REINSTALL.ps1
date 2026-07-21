[CmdletBinding()]
param(
    [switch]$SkipPipUpgrade,
    [string]$PythonExecutable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvDirectory = Join-Path $packageRoot '.venv'
$installerPath = Join-Path $packageRoot 'INSTALL.ps1'

if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw "Instalador nao encontrado: $installerPath"
}

$resolvedPackageRoot = [IO.Path]::GetFullPath($packageRoot).TrimEnd('\')
$resolvedVenvDirectory = [IO.Path]::GetFullPath($venvDirectory).TrimEnd('\')
$expectedVenvDirectory = Join-Path $resolvedPackageRoot '.venv'

if ($resolvedVenvDirectory -ne $expectedVenvDirectory) {
    throw 'A pasta do ambiente virtual nao foi validada. A reinstalacao foi cancelada.'
}

if (Test-Path -LiteralPath $resolvedVenvDirectory) {
    Write-Host 'Removendo somente o ambiente virtual .venv antigo...' -ForegroundColor Yellow
    Remove-Item -LiteralPath $resolvedVenvDirectory -Recurse -Force
}
else {
    Write-Host 'Nenhuma .venv anterior foi encontrada. Uma nova sera criada.' -ForegroundColor Yellow
}

$installParameters = @{}
if ($SkipPipUpgrade) {
    $installParameters.SkipPipUpgrade = $true
}
if (-not [string]::IsNullOrWhiteSpace($PythonExecutable)) {
    $installParameters.PythonExecutable = $PythonExecutable
}

& $installerPath @installParameters
