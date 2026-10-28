@echo off
setlocal
cd /d "%~dp0"
set "PORT=4319"
set "IX_STOP_LOG=%~dp0data\launcher\shutdown-latest.log"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-services.ps1"
if errorlevel 1 (
  powershell -NoProfile -WindowStyle Hidden -Command "$shell=New-Object -ComObject WScript.Shell; [void]$shell.Popup(('INFINITE-X OS could not stop cleanly.'+[Environment]::NewLine+'Diagnostics: '+$env:IX_STOP_LOG),0,'INFINITE-X OS shutdown error',16)"
  exit /b 1
)

exit /b 0
