@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm not found. Install Node.js first: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting Iron Citadel multiplayer server at ws://127.0.0.1:5174/
start "Iron Citadel WebSocket" cmd /k "cd /d ""%~dp0"" && npm run net"

echo Starting Iron Citadel at http://127.0.0.1:5173/
echo LAN players can open http://YOUR_HOST_IP:5173/
echo Press Ctrl+C in this window to stop the web server.
call npm run dev -- --port 5173

pause
