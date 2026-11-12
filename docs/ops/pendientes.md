# Pendientes MVP video

## SIMPLE-03 Messenger Bot
- Usa `documentId` placeholder `__SET_GOOGLE_SHEET_ID__`.
- No se tocó en Fase 1 (OK de Adrián).
- Cuando se configure el CRM real: alinear encabezados de `Leads` / `Leads_Bot` con los writers del workflow.

## PANEL-05 Acciones Lead
- Usa `documentId` placeholder `__SET_GOOGLE_SHEET_ID__` hacia `Leads_Bot`.
- No se tocó en Fase 1.
- Al apuntarlo al CRM real, verificar columnas `estado_seguimiento`, `status`, `ultima_actualizacion`, `updated_at`.

## Fase 2 — Clasificador en otros canales
- WhatsApp (SIMPLE-02) y Messenger (SIMPLE-03) no comparten la cadena `Parsear Respuesta Base` → clasificador de Telegram. Quedan fuera de este patch; llevar v1.1 canal por canal.

## Fuera de este MVP
- Esperar a que el cliente termine de escribir (D1 OmniCRM 74b): fase aparte por riesgo de carreras en static data.
