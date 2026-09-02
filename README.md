# Nodo Propiedades

CRM inmobiliario en **n8n**: bots por canal (Telegram / WhatsApp / Messenger), IA vía **Groq**, persistencia en **Google Sheets**.

## Arranque (lo práctico hoy)

1. Leer **`docs/ARRANQUE-LOCAL.md`**
2. `docker compose up -d` → n8n en http://localhost:5678
3. WhatsApp: **Meta Cloud API** — ver `docs/WHATSAPP-CLOUD-META.md` y `pnpm run patch-meta-all`
4. Importar workflows de `workflows/SIMPLE-*.json` y reemplazar placeholders `__SET_*__`
5. Credenciales solo en n8n / archivos `.env` locales (**nunca en git**)

### Stack documentado vs stack en uso

| | En repo / docs “Meta final” | Uso local habitual |
|--|----------------------------|-------------------|
| IA | Ollama + AI Agent (WF-00…13) | **Groq** (`llama-3.3-70b-versatile`) en bots SIMPLE / bot TG en n8n |
| WhatsApp | Meta Cloud API | **Meta Cloud API** (`meta-whatsapp` webhook) |
| Sheets CRM | `Leads` / `Interacciones` (csv/) | **`Leads_Bot` + `Consultas`** |

Los workflows `WF-*` de `docs/LEER PRIMERO - Meta Produccion Final.md` son un plan de despliegue Meta/Ollama; no son el runtime mínimo de los SIMPLE.

## Secretos

- Tokens de bots, API keys, `.env*` **no se versionan**
- En Telegram HTTP: usar `bot__SET_TELEGRAM_BOT_TOKEN__/` o la credencial n8n
- Si un token llegó a un commit viejo: **revocarlo** en BotFather / proveedor y generar uno nuevo

## Carpetas

| Carpeta | Contenido |
|---------|-----------|
| `workflows/` | JSON SIMPLE-01…04 (plantillas) |
| `docs/` | Documentación (arranque, Meta/legacy, runbooks) |
| `scripts/` | Utilidades de import/setup (sin dumps de sesión) |
| `config/` | Manifiesto / ejemplos (sin credentials reales) |
| `ai/` | Prompt y schema del AI Agent (plan/WF; no siempre cableado) |
| `csv/` | Esquemas de ejemplo para Sheets |

## Scripts legacy (n8n cerrado si tocan SQLite)

Ver `docs/LEER PRIMERO - Meta Produccion Final.md` y scripts `_post_import.js`, etc., si retomás el stack completo WF/Meta.

