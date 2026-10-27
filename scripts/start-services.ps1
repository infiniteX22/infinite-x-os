$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$openEdgeRoot = 'C:\Progress\OpenEdge'
$database = Join-Path $projectRoot 'data\openedge\ixosoe'
$pasManager = Join-Path $projectRoot 'data\pasoe\ixos\bin\tcman.bat'

if (-not (Test-Path (Join-Path $openEdgeRoot 'bin\proserve.bat'))) { throw 'OpenEdge 12.8 proserve was not found at C:\Progress\OpenEdge.' }
if (-not (Test-Path "$database.db")) { throw "The INFINITE-X OpenEdge database was not found at $database.db" }

$databaseListener = Get-NetTCPConnection -LocalPort 4335 -State Listen -ErrorAction SilentlyContinue
if (-not $databaseListener) {
  # Launch the broker executable directly. In non-interactive launchers proserve.bat's
  # Java wrapper can inherit the parent console lifetime and terminate immediately.
  $broker = Join-Path $openEdgeRoot 'bin\_mprosrv.exe'
  $arguments = ('"{0}" -S 4335 -H 127.0.0.1' -f $database)
  Start-Process -FilePath $broker -ArgumentList $arguments -WindowStyle Hidden | Out-Null
}

$deadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Milliseconds 400
  $databaseListener = Get-NetTCPConnection -LocalPort 4335 -State Listen -ErrorAction SilentlyContinue
} until ($databaseListener -or (Get-Date) -gt $deadline)
if (-not $databaseListener) { throw 'OpenEdge database broker did not open port 4335.' }

$pasListener = Get-NetTCPConnection -LocalPort 4326 -State Listen -ErrorAction SilentlyContinue
if (-not $pasListener) { & $pasManager start | Out-Host }
$deadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Milliseconds 400
  $pasListener = Get-NetTCPConnection -LocalPort 4326 -State Listen -ErrorAction SilentlyContinue
} until ($pasListener -or (Get-Date) -gt $deadline)
if (-not $pasListener) { throw 'PAS for OpenEdge did not open port 4326.' }

Write-Host 'OpenEdge broker: 127.0.0.1:4335'
Write-Host 'PAS for OpenEdge: http://127.0.0.1:4326/web/infinitex/health'
