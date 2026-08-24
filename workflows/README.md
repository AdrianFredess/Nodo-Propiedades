# Workflows exportados (fuente de verdad local)

## Producción (exportados del n8n activo)

| Archivo | ID n8n | Estado |
|---------|--------|--------|
| **Bot Telegram Inmobiliaria.json** | `8JoSfkcn3pE1f0av` | **Activo** — Telegram Trigger + Groq `openai/gpt-oss-120b` + Sheets |
| **SIMPLE-02 WhatsApp Bot.json** | `npq6sC6YLaUBpHac` | **Activo** — webhook WAHA `evolution-whatsapp` + Groq |
| **SIMPLE-04 Seguimiento Automatico.json** | `U7Ec6hIatY4t47Fu` | Activo (cron 5 min; envía si ≥20 min sin respuesta) |

## Panel comercial (nuevos — no tocan bots existentes)

| Archivo | Notas |
|---------|--------|
| **PANEL-01 API Leads.json** | `GET /webhook/panel-leads` — lee `Leads_Bot` + `Consultas`, responde JSON. Placeholders `__SET_GOOGLE_SHEET_ID__` / credencial. |
| **PANEL-02 Envio Masivo Telegram.json** | `POST /webhook/envio-masivo` body `{ chat_ids, text }`. Token: `__SET_TELEGRAM_BOT_TOKEN__`. |
| **PANEL-03 Stock Update.json** | `POST /webhook/panel-stock-update` body `{ id, field, value }` o `{ id, patch }` — escribe stock + emite `stock.updated` al WS bridge. |
| **PANEL-04 Realtime Emit.json** | `POST /webhook/panel-realtime-emit` body `{ type, payload }` — reenvía al bridge `http://host.docker.internal:3099/emit`. |

## Legacy / no reemplazan prod

| Archivo | Notas |
|---------|--------|
| **SIMPLE-01 Telegram Bot.json** | Prototipo por keywords + polling. **NO** es el bot de producción. Se conserva solo como referencia histórica. |
| **SIMPLE-03 Messenger Bot.json** | Pausado; requiere Meta. |

Export sanitizado: tokens y chat de owner reemplazados por `__SET_*__`. Credenciales n8n se reasignan al importar.
