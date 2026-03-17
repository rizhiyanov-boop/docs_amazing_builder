@echo off
cd /d "%~dp0"
set "PATH=%~dp0.tools\node22\node-v22.14.0-win-x64;%PATH%"
call .tools\node22\node-v22.14.0-win-x64\npm.cmd run dev -- --host 127.0.0.1

