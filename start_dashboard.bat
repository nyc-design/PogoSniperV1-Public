@echo off
ECHO Starting Pogo Reveal Dashboard...

REM Set the title for the main script window
TITLE Pogo Dashboard Launcher

REM Start the Backend Server
ECHO --- Starting Backend Server ---
start "Backend Server" cmd /k "node Server-bot.js"

REM Navigate into the frontend directory and start it
ECHO --- Starting Frontend UI ---
cd frontend
start "Frontend UI" cmd /k "npm start"

ECHO --- All services started! ---