@echo off
echo Launching Pogo Dashboard…

rem Backend (runs in background of this console)
start "" /B cmd /c node Server-bot.js

rem Front‑end
start "" /B cmd /c "cd frontend && npm start"

rem Wait for frontend to be ready on port 3000 before starting ngrok
echo Waiting for frontend on port 3000...
powershell -NoProfile -Command "$deadline=(Get-Date).AddMinutes(2); do { $ok=(Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue).TcpTestSucceeded; if(-not $ok){ Start-Sleep -Seconds 1 } } while(-not $ok -and (Get-Date) -lt $deadline); if(-not $ok){ Write-Host 'Port 3000 not available after timeout.'; exit 1 }"
if errorlevel 1 (
  echo Frontend not ready on port 3000. Ngrok may fail with 502.
) else (
  echo Frontend is up on port 3000.
)

rem Ngrok tunnel (only now that port 3000 is listening)
start "" /B cmd /c ngrok http 3000

rem Give Ngrok a moment, then grab the public URL and open browser
timeout /t 12 >nul
for /f %%U in ('powershell -NoProfile -Command "(Invoke-RestMethod http://127.0.0.1:4040/api/tunnels).tunnels[0].public_url"') do set DASHURL=%%U
start "" %DASHURL%

echo All services running in this window.  Press Ctrl+C to stop.
