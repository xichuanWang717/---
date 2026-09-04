@echo off
setlocal
cd /d "%~dp0"

start "Portfolio server" /min cmd /k "python -m http.server 4195 --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4195/index.html"

exit
