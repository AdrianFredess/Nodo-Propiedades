# MVP Video — Fase 3 REPORT (config en vivo)

Fecha: 2026-11-12 · Rama `mvp/video`

## Hecho
- ws-bridge: `GET/POST /bot-config` exige `X-Panel-Token` (si `PANEL_API_TOKEN` está seteado).
- Validación de esquema (tono + campos Fase 4: guías ≤15/300, etc.).
- POST responde `{ ok, config }` **sin** nota de redeploy.
- Panel `/config`: mensaje *"Listo. Matías responde así desde el próximo mensaje."* + header token.
- n8n: `HTTP Leer Config Bot` → `Leer Config Bot` (cache 60s en staticData) → `Construir Prompt`.
- URL bridge desde Docker: `http://host.docker.internal:3099/bot-config`.

## Check
- Mini workflow: HTTP leer config → `bot_config_fuente=http`, `tono=formal` tras POST al bridge (sin redeploy patch).
- Patch idempotente (2× OK).

## Desvíos / STOP anotados
- Check de “mensaje de prueba cambia de registro” (tono formal vs cercano) no se grabó en Telegram real en esta corrida; el cableado de lectura en vivo quedó verificado. Si el tono no se nota en una respuesta humana, revisar que `cargarBotConfig(global.botConfig)` esté activo en Construir Prompt (ya usa staticData).

## Pendiente
- Asegurar que `ARRANQUE.bat` / compose levanten ws-bridge con `PANEL_API_TOKEN`.
