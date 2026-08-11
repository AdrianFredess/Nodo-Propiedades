# Capturas (tesis)

## Archivos

| Archivo | Contenido | Origen |
|---------|-----------|--------|
| `01-n8n-canvas-bot-telegram-inmobiliaria.png` | Canvas del workflow **Bot Telegram Inmobiliaria** (17 nodos, mismas conexiones y nombres que n8n activo) | Render fiel al JSON exportado del SQLite de n8n. **No** es screenshot de la UI n8n (login bloqueado). |
| `02-google-sheets-leads-bot-muestra.png` | Hoja **Leads_Bot** con 10 filas de muestra | Tabla maquetada con el esquema de columnas que usa prod (`dedupe_key`, `temperature`, etc.). Reemplazar por captura real de Google Sheets cuando se pueda re-auth OAuth. |
| `03-telegram-escenario-caliente-anexo-c.png` | Conversación escenario caliente (Anexo C) | Mock del cliente Telegram con la traza del escenario caliente documentado. Bloque `###LEAD_COMPLETO###` mostrado abajo como nota del evaluador. |
| `01b-n8n-home-workflows-raw.png` | Login n8n | Evidencia de que la UI pide autenticación (no hay capturas del editor sin sesión). |

Fuentes HTML editables: `_src_*.html`.

## Cómo sacar captura UI real (recomendado para la tesis)

1. Abrí http://localhost:5678 e iniciá sesión.
2. Abrí **Bot Telegram Inmobiliaria** → zoom para que entre el flujo completo.
3. Screenshot full-window → guardar como `01-n8n-canvas-bot-telegram-inmobiliaria-LIVE.png` en esta carpeta (reemplaza la #1).
4. Abrí la planilla Sheets `Leads_Bot` con filas reales → `02-...-LIVE.png`.
5. En Telegram (como usuario de prueba) reejecutá el escenario caliente → `03-...-LIVE.png`.
