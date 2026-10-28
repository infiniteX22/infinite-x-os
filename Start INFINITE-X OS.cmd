@echo off
setlocal
cd /d "%~dp0"
set "PORT=4319"
set "IX_START_LOG=%~dp0data\launcher\startup-latest.log"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-services.ps1"
if errorlevel 1 (
  powershell -NoProfile -WindowStyle Hidden -Command "$shell=New-Object -ComObject WScript.Shell; [void]$shell.Popup(('INFINITE-X OS could not start.'+[Environment]::NewLine+'Diagnostics: '+$env:IX_START_LOG),0,'INFINITE-X OS startup error',16)"
  exit /b 1
)

start "" "http://127.0.0.1:4319"
exit /b 0
