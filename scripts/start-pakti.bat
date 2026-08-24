@echo off
echo Starting Pakti Backend + Cloudflare Tunnel...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0\start-backend-service.ps1"
powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoProfile -Command npx cloudflared tunnel run pakti-api' -WindowStyle Hidden"
echo Done. Check http://localhost:3001/api/health and https://api.pakti.zakado.id/api/health
pause
