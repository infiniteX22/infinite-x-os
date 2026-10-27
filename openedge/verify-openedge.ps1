$ErrorActionPreference = "Stop"
$oeRoot = "C:\Progress\OpenEdge"
$avm = Join-Path $oeRoot "bin\_progres.exe"
$prodb = Join-Path $oeRoot "bin\prodb.exe"
$projectRoot = Split-Path -Parent $PSScriptRoot
$databaseBase = Join-Path $projectRoot "data\openedge\ixosoe"

if (-not (Test-Path -LiteralPath $avm)) { throw "OpenEdge AVM not found at $avm" }
$env:DLC = $oeRoot
$env:PATH = "$(Join-Path $oeRoot 'bin');$env:PATH"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $databaseBase) | Out-Null

if (-not (Test-Path -LiteralPath "$databaseBase.db")) {
  & $prodb $databaseBase (Join-Path $oeRoot "empty")
  if ($LASTEXITCODE -ne 0) { throw "prodb failed with exit code $LASTEXITCODE" }
  Push-Location $projectRoot
  try {
    & $avm -b -1 -db "data\openedge\ixosoe" -p "openedge\setup.p" -param "openedge\infinite-x.df" -nosplash
    if ($LASTEXITCODE -ne 0) { throw "Schema load failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

Push-Location $PSScriptRoot
try {
  & $avm -b -1 -db "..\data\openedge\ixosoe" -p "compile.p" -nosplash
  if ($LASTEXITCODE -ne 0) { throw "ABL compile failed with exit code $LASTEXITCODE" }
  & $avm -b -1 -db "..\data\openedge\ixosoe" -p "verify-runtime.p" -nosplash
  if ($LASTEXITCODE -ne 0) { throw "OpenEdge runtime verification failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }
