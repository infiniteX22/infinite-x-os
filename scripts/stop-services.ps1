$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$openEdgeRoot = 'C:\Progress\OpenEdge'
$database = Join-Path $projectRoot 'data\openedge\ixosoe'
$pasRoot = Join-Path $projectRoot 'data\pasoe\ixos'
$pasManager = Join-Path $pasRoot 'bin\tcman.bat'
$pasPidFile = Join-Path $pasRoot 'logs\catalina-ixos.pid'
$runtimeDir = Join-Path $projectRoot 'data\launcher'
$logFile = Join-Path $runtimeDir 'shutdown-latest.log'
$nodePidFile = Join-Path $runtimeDir 'node.pid'
$brokerPidFile = Join-Path $runtimeDir 'broker.pid'
$nodePort = if ($env:PORT) { [int]$env:PORT } else { 4319 }
$pasPort = 4326
$databasePort = 4335

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Set-Content -LiteralPath $logFile -Value "INFINITE-X OS shutdown - $(Get-Date -Format o)" -Encoding UTF8

function Write-LauncherLog {
  param([string]$Message)
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
  Write-Host $line
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Get-Listener {
  param([int]$Port)
  return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Get-ProcessRecord {
  param([int]$ProcessId)
  return Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
}

function Wait-ForPortToClose {
  param([int]$Port,[int]$TimeoutSeconds,[string]$FailureMessage)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (-not (Get-Listener -Port $Port)) { return }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $deadline)
  throw $FailureMessage
}

function Get-RecordedPid {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  $first = (Get-Content -LiteralPath $Path -Raw).Trim().Split('|')[0]
  $parsed = 0
  if ([int]::TryParse($first,[ref]$parsed)) { return $parsed }
  return 0
}

$mutexNameBytes = [Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())
$sha256 = [Security.Cryptography.SHA256]::Create()
$mutexHash = ([BitConverter]::ToString($sha256.ComputeHash($mutexNameBytes)) -replace '-','').Substring(0,16)
$sha256.Dispose()
$mutex = [Threading.Mutex]::new($false,"Local\InfiniteXOS-Launcher-$mutexHash")
$acquired = $false

try {
  $acquired = $mutex.WaitOne([TimeSpan]::FromSeconds(45))
  if (-not $acquired) { throw 'Another INFINITE-X OS start or stop operation is still running.' }

  $nodeListener = Get-Listener -Port $nodePort
  if ($nodeListener) {
    $process = Get-ProcessRecord -ProcessId $nodeListener.OwningProcess
    $recordedPid = Get-RecordedPid -Path $nodePidFile
    $recognisableLegacyLaunch = $process -and $process.Name -eq 'node.exe' -and $process.CommandLine -match '(^|[\\/\s\"])(server\.mjs)(\s|$|\")'
    if (-not $process -or $process.Name -ne 'node.exe' -or ($recordedPid -ne $nodeListener.OwningProcess -and -not $recognisableLegacyLaunch)) {
      $name = if ($process) { $process.Name } else { 'unknown process' }
      throw "Port $nodePort belongs to $name (PID $($nodeListener.OwningProcess)); it was not stopped."
    }
    Write-LauncherLog "Stopping this clone's Node service (PID $($nodeListener.OwningProcess))."
    Stop-Process -Id $nodeListener.OwningProcess
    Wait-ForPortToClose -Port $nodePort -TimeoutSeconds 20 -FailureMessage "Node did not release port $nodePort."
  } else { Write-LauncherLog 'Node service is already stopped.' }
  if (Test-Path -LiteralPath $nodePidFile) { Remove-Item -LiteralPath $nodePidFile -Force }

  $pasListener = Get-Listener -Port $pasPort
  if ($pasListener) {
    $recordedPid = Get-RecordedPid -Path $pasPidFile
    $process = Get-ProcessRecord -ProcessId $pasListener.OwningProcess
    if ($recordedPid -ne $pasListener.OwningProcess -or -not $process -or $process.Name -ne 'java.exe' -or $process.CommandLine -notmatch '-Dpsc\.as\.alias=ixos') {
      $name = if ($process) { $process.Name } else { 'unknown process' }
      throw "Port $pasPort belongs to $name (PID $($pasListener.OwningProcess)); it was not stopped."
    }
    Write-LauncherLog "Stopping this clone's PAS instance (PID $($pasListener.OwningProcess))."
    & $pasManager stop 2>&1 | ForEach-Object { Write-LauncherLog $_ }
    Wait-ForPortToClose -Port $pasPort -TimeoutSeconds 45 -FailureMessage "PAS did not release port $pasPort."
  } else { Write-LauncherLog 'PAS is already stopped.' }

  $databaseListener = Get-Listener -Port $databasePort
  if ($databaseListener) {
    $process = Get-ProcessRecord -ProcessId $databaseListener.OwningProcess
    if (-not $process -or $process.Name -ne '_mprosrv.exe' -or $process.CommandLine -notlike "*$database*") {
      $name = if ($process) { $process.Name } else { 'unknown process' }
      throw "Port $databasePort belongs to $name (PID $($databaseListener.OwningProcess)); it was not stopped."
    }
    Write-LauncherLog "Stopping this clone's OpenEdge broker (PID $($databaseListener.OwningProcess))."
    & (Join-Path $openEdgeRoot 'bin\proshut.bat') $database -by 2>&1 | ForEach-Object { Write-LauncherLog $_ }
    Wait-ForPortToClose -Port $databasePort -TimeoutSeconds 45 -FailureMessage "OpenEdge did not release port $databasePort."
  } else { Write-LauncherLog 'OpenEdge broker is already stopped.' }
  if (Test-Path -LiteralPath $brokerPidFile) { Remove-Item -LiteralPath $brokerPidFile -Force }

  Write-LauncherLog 'INFINITE-X OS services stopped.'
  exit 0
} catch {
  Write-LauncherLog "ERROR: $($_.Exception.Message)"
  Write-Host "Shutdown failed. Diagnostics: $logFile" -ForegroundColor Red
  exit 1
} finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
