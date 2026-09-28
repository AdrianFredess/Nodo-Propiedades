# V4 — CORS y webhooks sin token

ngrok en `.env`: `https://deranged-defile-comrade.ngrok-free.dev` (si está caído, queda marcado).

## https://deranged-defile-comrade.ngrok-free.dev

GET /webhook/panel-leads -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
OPTIONS /webhook/panel-leads -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
POST /webhook/envio-masivo -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
OPTIONS /webhook/envio-masivo -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
POST /webhook/panel-stock-update -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
OPTIONS /webhook/panel-stock-update -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
POST /webhook/panel-realtime-emit -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
OPTIONS /webhook/panel-realtime-emit -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
POST /webhook/panel-lead-actions -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
OPTIONS /webhook/panel-lead-actions -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
POST /webhook/panel-assistant -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320
OPTIONS /webhook/panel-assistant -> 404 origin= allow-headers= body=The endpoint deranged-defile-comrade.ngrok-free.dev is offline. ERR_NGROK_320

## http://127.0.0.1:5678

GET /webhook/panel-leads -> 401 origin=http://localhost:5173 allow-headers= body={"ok":false,"error":"unauthorized"}
OPTIONS /webhook/panel-leads -> 204 origin=http://localhost:5173 allow-headers=X-Panel-Token body=
POST /webhook/envio-masivo -> 401 origin=http://localhost:5173 allow-headers= body={"ok":false,"error":"unauthorized"}
OPTIONS /webhook/envio-masivo -> 204 origin=http://localhost:5173 allow-headers=X-Panel-Token body=
POST /webhook/panel-stock-update -> 401 origin=http://localhost:5173 allow-headers= body={"ok":false,"error":"unauthorized"}
OPTIONS /webhook/panel-stock-update -> 204 origin=http://localhost:5173 allow-headers=X-Panel-Token body=
POST /webhook/panel-realtime-emit -> 401 origin=http://localhost:5173 allow-headers= body={"ok":false,"error":"unauthorized"}
OPTIONS /webhook/panel-realtime-emit -> 204 origin=http://localhost:5173 allow-headers=X-Panel-Token body=
POST /webhook/panel-lead-actions -> 401 origin=http://localhost:5173 allow-headers= body={"ok":false,"error":"unauthorized"}
OPTIONS /webhook/panel-lead-actions -> 204 origin=http://localhost:5173 allow-headers=X-Panel-Token body=
POST /webhook/panel-assistant -> 401 origin=http://localhost:5173 allow-headers= body={"ok":false,"error":"unauthorized"}
OPTIONS /webhook/panel-assistant -> 204 origin=http://localhost:5173 allow-headers=X-Panel-Token body=

**[verificar]** ngrok está apagado (`ERR_NGROK_320`). En localhost los 6 webhooks sin token dan 401 y el preflight de `X-Panel-Token` responde 204 con origen `http://localhost:5173`.
