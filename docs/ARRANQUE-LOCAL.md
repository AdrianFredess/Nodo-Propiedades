# Arranque local — Nodo Propiedades

## Nube local (3 pasos)

```bat
D:\Dev\Nodo-Propiedades\ARRANQUE.bat
```

Ver también `docs/ARRANQUE-NUBE-LOCAL.md`.

- Docker Desktop
- Credenciales en n8n (Google Sheets, Groq, Telegram) — **no** están en los JSON del repo
- Archivos `.env` locales (copiá los `*.example`)

## Levantar servicios

```bash
# n8n
docker compose up -d

# WhatsApp no-oficial (WAHA / WebJS) — recomendado si Meta Cloud no está disponible
# 1) copiar .env.waha.example → .env.waha y completar claves
docker compose -f docker-compose.waha.yml --env-file .env.waha up -d

# (Opcional) Evolution API — alternativa Baileys
# docker compose -f docker-compose.evolution.yml --env-file .env.evolution up -d
```

n8n: http://localhost:5678  
WAHA dashboard: http://localhost:3002  

## Panel comercial (frontend)

```bash
cd front
pnpm install --ignore-workspace
pnpm --ignore-workspace run dev
```

Por defecto usa datos demo (`VITE_USE_MOCK=true`). Para datos reales: importá `workflows/PANEL-01 API Leads.json` + `PANEL-02 Envio Masivo Telegram.json`, activá, y poné `VITE_USE_MOCK=false` en `front/.env`.

## Google Sheets (runtime)

| Hoja | Uso |
|------|-----|
| **Leads_Bot** | Estado actual del cliente (1 fila por chat; dedupe) |
| **Consultas** | Historial fechado por interacción |

Spreadsheet ID: configurarlo en los nodos de n8n (no commitear secrets).

## Workflows en el repo

| Archivo | Notas |
|---------|--------|
| `SIMPLE-01 Telegram Bot.json` | Prototipo polling. Token: placeholder `__SET_TELEGRAM_BOT_TOKEN__` |
| `SIMPLE-02 WhatsApp Bot.json` | Bot WA (webhook). En prod suele apuntar a WAHA path `evolution-whatsapp` |
| `SIMPLE-03 Messenger Bot.json` | Requiere Meta; a menudo pausado |
| `SIMPLE-04 Seguimiento Automatico.json` | Cron de recontactos sobre Leads_Bot |

**Producción en la instancia n8n local** puede incluir workflows editados fuera del repo (p. ej. bot Telegram con Groq). Re-exportar a `workflows/` sin tokens ni chat IDs personales.

## WhatsApp con WAHA (primera vinculación)

1. Crear sesión `nodo` en dashboard WAHA o `POST /api/sessions`
2. Escanear QR **una sola vez** con un **número dedicado** (no el celular personal de uso diario)
3. Webhook de WAHA → n8n: `.../webhook/evolution-whatsapp`
4. Sesión persistente en `./waha-data` (ignorada por git)

> Riesgo de ban: WAHA no es API oficial de Meta. Para producción seria usá WhatsApp Cloud API o un BSP.

## Secretos

Nunca subir:
- `.env`, `.env.waha`, `.env.evolution`
- tokens de Telegram, Groq, Meta, API keys de WAHA
- QR, `waha-data/`, dumps de sesión
- tesis/temporales `_tmp_*`
