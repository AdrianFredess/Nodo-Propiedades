# Workflows exportados (fuente de verdad local)

## Producción (exportados del n8n activo)

| Archivo | ID n8n | Estado |
|---------|--------|--------|
| **Bot Telegram Inmobiliaria.json** | `8JoSfkcn3pE1f0av` | **Activo** — Telegram Trigger + Groq `llama-3.3-70b-versatile` + Sheets |
| **SIMPLE-02 WhatsApp Bot.json** | `npq6sC6YLaUBpHac` | **Activo** — webhook WAHA `evolution-whatsapp` + Groq |
| **SIMPLE-04 Seguimiento Automatico.json** | `U7Ec6hIatY4t47Fu` | Activo (cron 5 min) |

## Legacy / no reemplazan prod

| Archivo | Notas |
|---------|--------|
| **SIMPLE-01 Telegram Bot.json** | Prototipo por keywords + polling. **NO** es el bot de producción. Se conserva solo como referencia histórica. |
| **SIMPLE-03 Messenger Bot.json** | Pausado; requiere Meta. |

Export sanitizado: tokens y chat de owner reemplazados por `__SET_*__`. Credenciales n8n se reasignan al importar.
