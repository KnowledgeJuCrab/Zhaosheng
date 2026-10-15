@echo off
chcp 65001 >nul
setlocal
set "ADMISSIONS_PREVIEW_NODE=node.exe"
if exist "D:\node.js\node.exe" set "ADMISSIONS_PREVIEW_NODE=D:\node.js\node.exe"
"%ADMISSIONS_PREVIEW_NODE%" "%~dp0start-local-preview.mjs"
if errorlevel 1 (
  echo Preview could not start. Please keep the error message above.
  pause
  exit /b 1
)
echo.
echo You can close this window. The local preview will keep running.
pause
