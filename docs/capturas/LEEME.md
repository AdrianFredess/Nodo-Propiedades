# Capturas (tesis)

## Archivos

| Archivo | Contenido | Origen |
|---------|-----------|--------|
| `01-n8n-canvas-bot-telegram-inmobiliaria.png` | Canvas del workflow **Bot Telegram Inmobiliaria** (17 nodos, mismas conexiones y nombres que n8n activo) | Render fiel al JSON exportado del SQLite de n8n. **No** es screenshot de la UI n8n (login bloqueado). |
| `02-google-sheets-leads-bot-muestra.png` | Hoja **Leads_Bot** con 10 filas de muestra | Tabla maquetada con el esquema de columnas que usa prod (`dedupe_key`, `temperature`, etc.). Reemplazar por captura real de Google Sheets cuando se pueda re-auth OAuth. |
| `03-telegram-escenario-caliente-anexo-c.png` | Conversación escenario caliente (Anexo C) | Mock del cliente Telegram con la traza del escenario caliente documentado. Bloque `###LEAD_COMPLETO###` mostrado abajo como nota del evaluador. |
| `01b-n8n-home-workflows-raw.png` | Login n8n | Evidencia de que la UI pide autenticación (no hay capturas del editor sin sesión). |
| `04-panel-resumen-ejecutivo.png` | Panel comercial — resumen | UI real (`front/`) con **seed mock** (VITE_USE_MOCK=true). |
| `05-panel-pipeline-kanban.png` | Panel — pipeline Frío/Tibio/Caliente | UI real, solo lectura + checkboxes Telegram. |
| `06-panel-detalle-lead.png` | Panel — detalle + historial | UI real, lead demo Carla Méndez. |
| `07-panel-mensaje-telegram.png` | Panel — barra de mensaje a seleccionados | UI real con 2 leads Telegram seleccionados. |

Fuentes HTML editables: `_src_*.html`.

## Datos del panel

Las capturas `04`–`07` usan el seed en `front/src/data/seed.ts` (marcadas como “Demo” en la UI). Para capturas con planilla real:

1. Importá y activá `workflows/PANEL-01 API Leads.json` en n8n (Docker arriba).
2. En `front/.env`: `VITE_USE_MOCK=false`.
3. `pnpm --ignore-workspace run dev` y volvé a capturar.

## Cómo sacar captura UI real (recomendado para la tesis)

1. Abrí http://localhost:5678 e iniciá sesión.
2. Abrí **Bot Telegram Inmobiliaria** → zoom para que entre el flujo completo.
3. Screenshot full-window → guardar como `01-n8n-canvas-bot-telegram-inmobiliaria-LIVE.png` en esta carpeta (reemplaza la #1).
4. Abrí la planilla Sheets `Leads_Bot` con filas reales → `02-...-LIVE.png`.
5. En Telegram (como usuario de prueba) reejecutá el escenario caliente → `03-...-LIVE.png`.
