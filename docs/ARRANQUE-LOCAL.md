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
```

n8n: http://localhost:5678  

WhatsApp usa **Meta Cloud API** (no requiere contenedor local). Ver `docs/WHATSAPP-CLOUD-META.md` y variables `META_*` en `.env`.

### Login n8n (Docker local)

- **Basic auth:** desactivado en `docker-compose.yml` (`N8N_BASIC_AUTH_ACTIVE=false`).
- **Usuario owner** (cuenta n8n): email `adrianfredes12@gmail.com`, contraseña por defecto del repo `adriann8n10f` (ver `scripts/restore_n8n_owner.js`).
- Si no entra: `docker stop nodo-propiedades-n8n-1` y luego una de:
  - `node scripts/restore_n8n_owner.js adrianfredes12@gmail.com adriann8n10f`
  - `$env:N8N_RESET_EMAIL="adrianfredes12@gmail.com"; $env:N8N_RESET_PASSWORD="tu-clave"; node scripts/_reset_n8n_user_password.js`
- Datos persistentes: `N8N_HOST_DATA_DIR` en `.env` (ej. `C:/Users/adrian/.n8n`).

**URLs con ngrok activo:** editor y webhooks en `https://deranged-defile-comrade.ngrok-free.dev` (mismo túnel que `:5678`).

## Panel comercial (frontend)

```bash
cd front
pnpm install --ignore-workspace
pnpm --ignore-workspace run dev
```

Por defecto usa datos reales (`VITE_USE_MOCK=false`). Para demo offline: `VITE_USE_MOCK=true` (seed vacío). Importá `workflows/PANEL-01 API Leads.json` + `PANEL-02 Envio Masivo Telegram.json`, activá, y mantené `VITE_USE_MOCK=false` en `front/.env`.

## Google Sheets (runtime)

| Hoja | Uso |
|------|-----|
| **Leads_Bot** | Estado actual del cliente (1 fila por chat; dedupe) |
| **Consultas** | Historial fechado por interacción |
| **Aprendizaje_Matias** | Few-shot Matías (consulta/respuesta). Ver `docs/APRENDIZAJE-MATIAS.md` |

Spreadsheet ID: configurarlo en los nodos de n8n (no commitear secrets).

## Workflows en el repo

| Archivo | Notas |
|---------|--------|
| `SIMPLE-01 Telegram Bot.json` | Prototipo polling. Token: placeholder `__SET_TELEGRAM_BOT_TOKEN__` |
| `SIMPLE-02 WhatsApp Bot.json` | Bot WA (webhook Meta `meta-whatsapp`) |
| `SIMPLE-03 Messenger Bot.json` | Requiere Meta; a menudo pausado |
| `SIMPLE-04 Seguimiento Automatico.json` | Cron de recontactos sobre Leads_Bot |

**Producción en la instancia n8n local** puede incluir workflows editados fuera del repo (p. ej. bot Telegram con Groq). Re-exportar a `workflows/` sin tokens ni chat IDs personales.

## WhatsApp (Meta Cloud API)

1. Completá `META_*` en `.env` (ver `docs/WHATSAPP-CLOUD-META.md`).
2. Webhook Meta → n8n: `.../webhook/meta-whatsapp`
3. Aplicá parches: `pnpm run patch-meta-all` (o `node scripts/patch-meta-whatsapp.js --deploy`)

## Secretos

Nunca subir:
- `.env`, `.env.evolution`
- tokens de Telegram, Groq, Meta
- tesis/temporales `_tmp_*`

> Legacy: si tenés datos viejos de WAHA en `./waha-data/` (gitignored), podés borrarlos a mano; ya no se usan.
