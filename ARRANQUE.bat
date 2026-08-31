@echo off
REM Nube local Nodo Propiedades — n8n + ngrok + ws-bridge + front + webhook TG
cd /d D:\Dev\Nodo-Propiedades

echo [1/5] n8n (Docker)
docker compose up -d
if errorlevel 1 echo FALLO docker compose & exit /b 1

echo Esperando health n8n...
set /a _tries=0
:wait_n8n
set /a _tries+=1
curl.exe -s -o NUL -w "%%{http_code}" http://127.0.0.1:5678/healthz | findstr /r "200" >nul
if not errorlevel 1 goto n8n_ok
if %_tries% GEQ 30 (
  echo n8n no respondio a tiempo
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_n8n
:n8n_ok
echo n8n OK

echo [2/5] ngrok -^> :5678 (dominio fijo)
tasklist /FI "IMAGENAME eq ngrok.exe" 2>NUL | find /I "ngrok.exe" >NUL
if errorlevel 1 (
  start "ngrok-nodo" cmd /c "ngrok http --domain=deranged-defile-comrade.ngrok-free.dev 5678"
  timeout /t 3 /nobreak >nul
) else (
  echo ngrok ya estaba corriendo
)

echo [3/5] WebSocket bridge :3099
curl.exe -s -o NUL -w "%%{http_code}" http://127.0.0.1:3099/health | findstr /r "200" >nul
if errorlevel 1 (
  start "ws-bridge-nodo" cmd /c "cd /d D:\Dev\Nodo-Propiedades\ws-bridge && pnpm --ignore-workspace start"
  timeout /t 2 /nobreak >nul
) else (
  echo ws-bridge ya estaba corriendo
)

echo [4/5] Webhook Telegram -^> ngrok
node scripts/set-telegram-webhook.js
if errorlevel 1 echo AVISO: no se pudo re-set webhook TG (revisar red/token)

echo [5/6] Front panel
cd front
start "front-nodo" cmd /c "pnpm --ignore-workspace run dev -- --host 127.0.0.1 --port 5173"
cd ..

echo [6/6] ngrok catalogo (opcional)
if not "%NGROK_CATALOG_DOMAIN%"=="" (
  call scripts\ngrok-catalogo.bat
) else (
  echo Sin NGROK_CATALOG_DOMAIN — links de ficha solo en localhost
)

echo.
echo Listo:
echo   Panel  http://localhost:5173
echo   n8n    http://localhost:5678
echo   WS     http://localhost:3099/health  /  ws://127.0.0.1:3099/ws
echo   ngrok  https://deranged-defile-comrade.ngrok-free.dev
echo.
echo Endpoints panel:
echo   GET  /webhook/panel-leads
echo   POST /webhook/envio-masivo
echo   POST /webhook/panel-stock-update
echo   POST /webhook/panel-realtime-emit
echo.
echo Politicas pago: docs\POLITICAS-PAGO.md  (hoja Politicas_Pago)
echo FormSubmit: configurar __SET_NOTIFY_EMAIL__ en el nodo Email Lead Caliente.
exit /b 0
