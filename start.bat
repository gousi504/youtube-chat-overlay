@echo off
chcp 65001 >nul
cd /d "%~dp0"
title YouTube Chat Overlay
set "NODE=node"
if exist "%~dp0runtime\node.exe" set "NODE=%~dp0runtime\node.exe"
if not exist "%~dp0node_modules" call npm install --omit=dev
echo 起動中... この黒い窓は閉じないでください
start "" http://localhost:3456/
"%NODE%" server.js
pause
