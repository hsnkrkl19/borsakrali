@echo off
cd /d "%~dp0"
set NODE_ENV=production
node src/server-live.js
