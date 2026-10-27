$ErrorActionPreference = 'Continue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$database = Join-Path $projectRoot 'data\openedge\ixosoe'
& (Join-Path $projectRoot 'data\pasoe\ixos\bin\tcman.bat') stop | Out-Host
& 'C:\Progress\OpenEdge\bin\proshut.bat' $database -by | Out-Host
