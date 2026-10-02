@echo off
setlocal
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
  echo Node.js 22+ is required. Set NODE_EXE to its full path, or use the release package with runtime\node.exe.
  pause
  exit /b 1
)
set "BRIDGE_NODE=node.exe"
:run
"%BRIDGE_NODE%" "%~dp0server.mjs" %*
if errorlevel 1 pause
