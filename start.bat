@echo off
echo Launching Pogo Dashboard…

rem Backend (runs in background of this console)
start "" /B cmd /c node Server-bot.js

rem Front‑end
start "" /B cmd /c "cd frontend && npm start"

rem Ngrok tunnel
start "" /B cmd /c ngrok http 3000

rem Give Ngrok a moment, then grab the public URL and open browser
timeout /t 12 >nul
for /f %%U in ('powershell -NoProfile -Command "(Invoke-RestMethod http://127.0.0.1:4040/api/tunnels).tunnels[0].public_url"') do set DASHURL=%%U
start "" %DASHURL%

echo All services running in this window.  Press Ctrl+C to stop.
