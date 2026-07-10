@echo off
set PORT=3001
cd /d "%~dp0"
node backend/server.js >> server-3001.log 2>&1
