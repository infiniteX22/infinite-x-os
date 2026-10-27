@echo off
setlocal
cd /d "%~dp0"
set PORT=4319
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-services.ps1"
if errorlevel 1 exit /b %errorlevel%
start "" http://127.0.0.1:4319
npm start
