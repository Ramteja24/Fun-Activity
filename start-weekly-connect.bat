@echo off
rem One-click launcher for the host's Windows laptop: installs/builds on first run, then starts the game server.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20+ is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install || (pause & exit /b 1)
)
if not exist admin.json (
  echo.
  echo Set up the admin login ^(first run only^). Only the admin can create rooms and run the games.
  call npm run admin || (pause & exit /b 1)
)
if not exist dist\server.mjs (
  echo Building the game ^(first run only^)...
  call npm run build || (pause & exit /b 1)
)
echo.
echo Starting the race server. Keep this window open during the event.
echo Teammates on the same Wi-Fi/office network open the "Network" address printed below.
echo.
call npm start
pause
