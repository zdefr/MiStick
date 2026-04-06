param(
    [string]$Python = '',
    [string]$DistDir = ''
)

$ErrorActionPreference = 'Stop'

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$distName = 'mihome-bridge-service'
$entryPoint = Join-Path $serviceRoot 'run_bridge.py'
$buildRoot = Join-Path $serviceRoot '.build\pyinstaller'

function Resolve-PythonInterpreter {
    param([string]$Root)

    $candidates = @(
        (Join-Path $Root 'venv\Scripts\python.exe'),
        (Join-Path $Root '.venv\Scripts\python.exe')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        return $pythonCommand.Source
    }

    return $null
}

if (-not $Python) {
    $Python = Resolve-PythonInterpreter -Root $serviceRoot
}

if (-not $Python) {
    throw 'No Python interpreter was found. Prepare packages/mihome-bridge-service/venv or .venv, or add python to PATH.'
}

if (-not (Test-Path $entryPoint)) {
    throw "Bridge entrypoint was not found: $entryPoint"
}

if (-not $DistDir) {
    $DistDir = Join-Path $serviceRoot 'dist'
}

Write-Host "Using Python: $Python"
Write-Host "Bridge root: $serviceRoot"
Write-Host "Bridge dist: $DistDir"

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null

Push-Location $serviceRoot
try {
    & $Python -m pip install --disable-pip-version-check -r requirements.txt
    & $Python -m pip install --disable-pip-version-check pyinstaller
    & $Python -m PyInstaller `
        --noconfirm `
        --clean `
        --onedir `
        --console `
        --name $distName `
        --distpath $DistDir `
        --workpath $buildRoot `
        --specpath $buildRoot `
        --paths $serviceRoot `
        $entryPoint
}
finally {
    Pop-Location
}

Write-Host "Bundled bridge ready: $(Join-Path $DistDir $distName)"
