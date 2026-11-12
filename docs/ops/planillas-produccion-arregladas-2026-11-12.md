# Planillas de producción arregladas — 2026-11-12

## Antes / después (encabezados fila 1)

### Historial (`conversaciones` / Hoja 1)

- Antes: `chat_id | nombre_usuario | lead_completo | respuesta_bot | historial_json | turno | row_exists | fecha | nombre | zona | presupuesto | tipo_operacion | temperatura | resumen`
- Después: `chat_id | nombre_usuario | lead_completo | respuesta_bot | historial_json | turno | row_exists | fecha | nombre | zona | presupuesto | tipo_operacion | temperatura | resumen | ultima_actualizacion | propiedad_seguimiento | bot_paused`
- Agregadas al final: `ultima_actualizacion, propiedad_seguimiento, bot_paused`

### Leads_Bot (CRM)

- Antes: `chat_id | nombre | zona | canal_origen | estado_seguimiento | ultima_actualizacion | temperature | presupuesto | lead_completo | dedupe_key | last_message | status | tipo_operacion | propiedad_seguimiento | lead_name | source`
- Después: `chat_id | nombre | zona | canal_origen | estado_seguimiento | ultima_actualizacion | temperature | presupuesto | lead_completo | dedupe_key | last_message | status | tipo_operacion | propiedad_seguimiento | lead_name | source | bot_paused | handoff | senales_json | last_interaction_at | phone | updated_at | created_at | lead_id | consultas_count | dormitorios | historial | last_bot_message | lead_intent | operacion | tipo_propiedad | ultima_consulta_fecha`
- Agregadas al final (orden): `bot_paused, handoff, senales_json, last_interaction_at, phone, updated_at, created_at, lead_id, consultas_count, dormitorios, historial, last_bot_message, lead_intent, operacion, tipo_propiedad, ultima_consulta_fecha`

### Consultas (CRM)

- Antes: `spreadsheetId | sheetId | title | index | sheetType | gridProperties`
- Después: `consulta_id | chat_id | fecha | fecha_local | anio | mes | canal_origen | nombre | mensaje_cliente | respuesta_bot | intencion | operacion | zona | presupuesto | temperature | lead_completo | es_nueva_consulta | phone | dormitorios | tipo_propiedad`
- Backup fila 1 → pestaña `Consultas_encabezado_anterior`

### Leads_Completos (planilla leads_bot `18eZ…`)

- Encabezados: `chat_id | fecha | nombre | presupuesto | resumen | temperatura | tipo_operacion | zona`

### Conversaciones_Revision (CRM, nueva)

- Encabezados: `fecha_hora | canal | motivo | chat_id | lead_name | ultimo_mensaje_cliente | respuesta_bot | historial_json | mensajes_extra`

## Nodo Guardar Lead

- `sheetName` → `Leads_Completos` (vía patch-workflow)
- `Hoja 1` no se tocó

## Columnas extra pedidas (OK Adrián)

### Consultas R–T
`phone`, `dormitorios`, `tipo_propiedad`

### Leads_Bot (después de lo existente; sin reordenar ni borrar)
Agregadas al final, en este orden:
`bot_paused`, `handoff`, `senales_json`, `last_interaction_at`, `phone`, `updated_at`, `created_at`, `lead_id`, `consultas_count`, `dormitorios`, `historial`, `last_bot_message`, `lead_intent`, `operacion`, `tipo_propiedad`, `ultima_consulta_fecha`

## Check Fase 1

- Backup: `docs/ops/backup-planillas-2026-11-12/` (gitignored)
- Pendientes: `docs/ops/pendientes.md` (SIMPLE-03, PANEL-05)
- Check A: 3 chats `893000001–003` → writers Historial / Sync Leads_Bot / Consultas / Guardar Lead sin error; filas en las 4 hojas
- Check B: 1 sola alerta con documentId roto; `chat_id: 893000001, 893000002, 893000003`
- Resultado: `docs/ops/check-f1-writes-2026-11-12.json` → **F1 CHECK OK**
