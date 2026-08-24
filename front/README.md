# Panel comercial — Nodo Propiedades

Frontend de tesis: resumen, pipeline (solo lectura) y detalle de leads. Los datos salen de un endpoint JSON (misma planilla `Leads_Bot` + `Consultas`) o de un seed de demostración.

## Arranque

```bash
cd front
pnpm install --ignore-workspace
pnpm --ignore-workspace run dev
```

Abrí la URL que muestra Vite (por defecto http://localhost:5173).

> Usá siempre `--ignore-workspace` (también hay `.npmrc` con `ignore-workspace=true`) para no disparar el install del monorepo raíz (`better-sqlite3`).

## Variables

Copiá `.env.example` → `.env`:

| Variable | Descripción |
|----------|-------------|
| `VITE_USE_MOCK` | `true` = seed demo (default). `false` = llama al API de leads |
| `VITE_LEADS_API_URL` | `GET` JSON de leads (p. ej. `http://localhost:5678/webhook/panel-leads`) |
| `VITE_ENVIO_MASIVO_URL` | `POST` `{ chat_ids, text }` Telegram |
| `VITE_POLL_INTERVAL_MS` | Polling (default 20000) |

## Datos en vivo

1. Importá en n8n: `workflows/PANEL-01 API Leads.json` y `workflows/PANEL-02 Envio Masivo Telegram.json`
2. Asigná credencial Google Sheets y reemplazá placeholders `__SET_*__`
3. Activá ambos workflows
4. En `.env`: `VITE_USE_MOCK=false`

## Capturas

Las capturas del panel viven en `docs/capturas/` (`04-panel-*.png`). El seed mock está marcado en `docs/capturas/LEEME.md`.
