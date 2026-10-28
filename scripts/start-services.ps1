$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$openEdgeRoot = 'C:\Progress\OpenEdge'
$database = Join-Path $projectRoot 'data\openedge\ixosoe'
$pasRoot = Join-Path $projectRoot 'data\pasoe\ixos'
$pasManager = Join-Path $pasRoot 'bin\tcman.bat'
$pasPidFile = Join-Path $pasRoot 'logs\catalina-ixos.pid'
$runtimeDir = Join-Path $projectRoot 'data\launcher'
$logFile = Join-Path $runtimeDir 'startup-latest.log'
$nodePidFile = Join-Path $runtimeDir 'node.pid'
$brokerPidFile = Join-Path $runtimeDir 'broker.pid'
$nodePort = if ($env:PORT) { [int]$env:PORT } else { 4319 }
$pasPort = 4326
$databasePort = 4335

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Set-Content -LiteralPath $logFile -Value "INFINITE-X OS startup - $(Get-Date -Format o)" -Encoding UTF8

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

function Wait-ForCondition {
  param([scriptblock]$Condition,[int]$TimeoutSeconds,[string]$FailureMessage)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $deadline)
  throw $FailureMessage
}

function Assert-DatabaseOwner {
  param($Listener)
  $process = Get-ProcessRecord -ProcessId $Listener.OwningProcess
  if (-not $process -or $process.Name -ne '_mprosrv.exe' -or $process.CommandLine -notlike "*$database*") {
    $name = if ($process) { $process.Name } else { 'unknown process' }
    throw "Port $databasePort belongs to $name (PID $($Listener.OwningProcess)), not this clone's OpenEdge database. Stop or reconfigure that process; the launcher will not terminate it."
  }
}

function Get-PasRecordedPid {
  if (-not (Test-Path -LiteralPath $pasPidFile)) { return 0 }
  $first = (Get-Content -LiteralPath $pasPidFile -Raw).Trim().Split('|')[0]
  $parsed = 0
  if ([int]::TryParse($first,[ref]$parsed)) { return $parsed }
  return 0
}

function Assert-PasOwner {
  param($Listener)
  $recordedPid = Get-PasRecordedPid
  $process = Get-ProcessRecord -ProcessId $Listener.OwningProcess
  if ($recordedPid -ne $Listener.OwningProcess -or -not $process -or $process.Name -ne 'java.exe' -or $process.CommandLine -notmatch '-Dpsc\.as\.alias=ixos') {
    $name = if ($process) { $process.Name } else { 'unknown process' }
    throw "Port $pasPort belongs to $name (PID $($Listener.OwningProcess)), not this clone's PAS instance. Stop or reconfigure that process; the launcher will not terminate it."
  }
}

function Test-PasHealth {
  $tokenFile = Join-Path $projectRoot 'data\openedge\service-token.txt'
  if (-not (Test-Path -LiteralPath $tokenFile)) { return $false }
  $token = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
  if (-not $token) { return $false }
  try {
    $response = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$pasPort/web/infinitex/health" -Headers @{ 'X-IX-Service-Token' = $token } -TimeoutSec 3
    return $response.ok -eq $true -and $response.repository -eq 'OpenEdge'
  } catch { return $false }
}

function Test-ApplicationHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$nodePort/" -TimeoutSec 3
    return $response.StatusCode -eq 200 -and $response.Content -match 'INFINITE-X OS'
  } catch { return $false }
}

function Assert-NodeOwner {
  param($Listener)
  $process = Get-ProcessRecord -ProcessId $Listener.OwningProcess
  $recordedPid = 0
  if (Test-Path -LiteralPath $nodePidFile) {
    [void][int]::TryParse((Get-Content -LiteralPath $nodePidFile -Raw).Trim(),[ref]$recordedPid)
  }
  $managed = $recordedPid -eq $Listener.OwningProcess
  $recognisableLegacyLaunch = $process -and $process.Name -eq 'node.exe' -and $process.CommandLine -match '(^|[\\/\s\"])(server\.mjs)(\s|$|\")'
  if (-not $process -or $process.Name -ne 'node.exe' -or (-not $managed -and -not $recognisableLegacyLaunch) -or -not (Test-ApplicationHealth)) {
    $name = if ($process) { $process.Name } else { 'unknown process' }
    throw "Port $nodePort belongs to $name (PID $($Listener.OwningProcess)), not a healthy INFINITE-X OS Node service. Stop or reconfigure that process; the launcher will not terminate it."
  }
  Set-Content -LiteralPath $nodePidFile -Value $Listener.OwningProcess -Encoding ASCII
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

  foreach ($required in @(
    (Join-Path $openEdgeRoot 'bin\_mprosrv.exe'),
    (Join-Path $openEdgeRoot 'bin\proshut.bat'),
    $pasManager,
    "$database.db",
    (Join-Path $projectRoot 'server.mjs')
  )) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required component was not found: $required" }
  }

  $databaseListener = Get-Listener -Port $databasePort
  if ($databaseListener) {
    Assert-DatabaseOwner -Listener $databaseListener
    Write-LauncherLog "Reusing this clone's OpenEdge broker on 127.0.0.1:$databasePort."
  } else {
    Write-LauncherLog 'Starting the OpenEdge broker.'
    $broker = Join-Path $openEdgeRoot 'bin\_mprosrv.exe'
    $arguments = ('"{0}" -S {1} -H 127.0.0.1' -f $database,$databasePort)
    Start-Process -FilePath $broker -ArgumentList $arguments -WindowStyle Hidden | Out-Null
    Wait-ForCondition -TimeoutSeconds 30 -FailureMessage "OpenEdge did not become ready on port $databasePort." -Condition { [bool](Get-Listener -Port $databasePort) }
    $databaseListener = Get-Listener -Port $databasePort
    Assert-DatabaseOwner -Listener $databaseListener
  }
  Set-Content -LiteralPath $brokerPidFile -Value $databaseListener.OwningProcess -Encoding ASCII

  $pasListener = Get-Listener -Port $pasPort
  if ($pasListener) {
    Assert-PasOwner -Listener $pasListener
    Write-LauncherLog "Reusing this clone's PAS instance on 127.0.0.1:$pasPort."
  } else {
    Write-LauncherLog 'Starting PAS for OpenEdge.'
    & $pasManager start 2>&1 | ForEach-Object { Write-LauncherLog $_ }
    Wait-ForCondition -TimeoutSeconds 45 -FailureMessage "PAS for OpenEdge did not open port $pasPort." -Condition { [bool](Get-Listener -Port $pasPort) }
    $pasListener = Get-Listener -Port $pasPort
    Assert-PasOwner -Listener $pasListener
  }
  Wait-ForCondition -TimeoutSeconds 45 -FailureMessage "PAS opened port $pasPort but its authenticated OpenEdge health check did not become ready." -Condition { Test-PasHealth }
  Write-LauncherLog 'PAS authenticated health check passed.'

  $nodeListener = Get-Listener -Port $nodePort
  if ($nodeListener) {
    Assert-NodeOwner -Listener $nodeListener
    Write-LauncherLog "Reusing the healthy INFINITE-X OS Node service on 127.0.0.1:$nodePort."
  } else {
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $serverPath = Join-Path $projectRoot 'server.mjs'
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdout = Join-Path $runtimeDir "node-$stamp.stdout.log"
    $stderr = Join-Path $runtimeDir "node-$stamp.stderr.log"
    Write-LauncherLog 'Starting the INFINITE-X OS Node service.'
    $nodeProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @("`"$serverPath`"") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    Set-Content -LiteralPath $nodePidFile -Value $nodeProcess.Id -Encoding ASCII
    try {
      Wait-ForCondition -TimeoutSeconds 60 -FailureMessage "The Node service did not become healthy on port $nodePort. Review $stderr" -Condition { Test-ApplicationHealth }
    } catch {
      if (-not $nodeProcess.HasExited) { Stop-Process -Id $nodeProcess.Id -ErrorAction SilentlyContinue }
      throw
    }
    $nodeListener = Get-Listener -Port $nodePort
    Assert-NodeOwner -Listener $nodeListener
  }

  Write-LauncherLog "Stack healthy: http://127.0.0.1:$nodePort"
  exit 0
} catch {
  Write-LauncherLog "ERROR: $($_.Exception.Message)"
  Write-Host "Startup failed. Diagnostics: $logFile" -ForegroundColor Red
  exit 1
} finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
