@echo off
setlocal
set "BRIDGE_ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "BRIDGE_ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "BRIDGE_ARCH=arm64"
set "BRIDGE_NODE=%~dp0runtime\%BRIDGE_ARCH%\node.exe"
if exist "%BRIDGE_NODE%" goto run
set "BRIDGE_NODE=%~dp0runtime\node.exe"
if exist "%BRIDGE_NODE%" goto run
if defined NODE_EXE (
  set "BRIDGE_NODE=%NODE_EXE%"
  goto run
)
set "BRIDGE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%BRIDGE_NODE%" goto run
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ was not found. Extract the full DocBuilder ZIP before running start-confluence.cmd.
  pause
  exit /b 1
)
set "BRIDGE_NODE=node.exe"
:run
if "%~1"=="" (
  "%BRIDGE_NODE%" "%~dp0server.mjs" --open
) else (
  "%BRIDGE_NODE%" "%~dp0server.mjs" %*
)
if errorlevel 1 pause
