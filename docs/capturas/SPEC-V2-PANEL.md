# Capturas Spec v2 — panel comercial

## Cómo abrir el panel
```bash
cd D:\Dev\Nodo-Propiedades\front
pnpm install --ignore-workspace
pnpm --ignore-workspace run dev
```
- URL local Vite (típicamente http://localhost:5173)
- `VITE_USE_MOCK=false` → datos reales vía `GET http://localhost:5678/webhook/panel-leads`
- Envío Telegram: `POST http://localhost:5678/webhook/envio-masivo`

## Endpoints
| Endpoint | Workflow |
|----------|----------|
| GET `/webhook/panel-leads` | PANEL-01 (leads + propiedades + interesados) |
| POST `/webhook/envio-masivo` | PANEL-02 `{ chat_ids, text }` |

## Notas
- Stock = misma planilla que nodo `Leer Stock Propiedades` del Bot Telegram.
- Si Google Sheets responde cuota (`too many requests`), el panel muestra `warning` y listas vacías — **no** se inventan datos mock.
- Poll del front: 45s para reducir lecturas a Sheets.
