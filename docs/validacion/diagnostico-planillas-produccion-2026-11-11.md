# Diagnóstico planillas de producción — 2026-11-11

- Workflow: `8JoSfkcn3pE1f0av` (solo lectura)
- Credencial Sheets: `Cuenta de Google Sheets`

## Guardar Lead

- operation: `appendOrUpdate`
- documentId: `18eZ-ryGdRC4jVbzfd11ttITl3VwuW00HPxbAzU0LimQ`
- sheetName: `Sheet1`
- matchingColumns: `chat_id`
- columnas mapeadas: `chat_id`, `fecha`, `nombre`, `presupuesto`, `resumen`, `temperatura`, `tipo_operacion`, `zona`
- título planilla: `leads_bot`
- pestañas: `Hoja 1`
- pestaña destino existe: **no**
- última evidencia de error del nodo: (no encontrado en las últimas 10 ejecuciones muestreadas)

## Actualizar Historial

- operation: `appendOrUpdate`
- documentId: `1r7EIzgF8vB3PdS2__m3qC-eSB2W9b4rC4v8Ajs8iAoo`
- sheetName: `Hoja 1`
- matchingColumns: `chat_id`
- columnas mapeadas: `chat_id`, `ultima_actualizacion`, `nombre`, `historial_json`, `turno`, `propiedad_seguimiento`, `temperatura`, `bot_paused`
- título planilla: `conversaciones`
- pestañas: `Hoja 1`
- pestaña destino existe: **sí**
- encabezados reales: `chat_id` | `nombre_usuario` | `lead_completo` | `respuesta_bot` | `historial_json` | `turno` | `row_exists` | `fecha` | `nombre` | `zona` | `presupuesto` | `tipo_operacion` | `temperatura` | `resumen`
- columnas mapeadas ausentes en encabezados: `ultima_actualizacion`, `propiedad_seguimiento`, `bot_paused`
- matching ausente: (ninguna)
- última evidencia de error del nodo: (no encontrado en las últimas 10 ejecuciones muestreadas)

## Sync Leads_Bot

- operation: `appendOrUpdate`
- documentId: `1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ`
- sheetName: `Leads_Bot`
- matchingColumns: `chat_id`
- columnas mapeadas: `canal_origen`, `chat_id`, `dedupe_key`, `estado_seguimiento`, `last_message`, `lead_name`, `nombre`, `presupuesto`, `source`, `status`, `temperature`, `tipo_operacion`, `ultima_actualizacion`, `zona`, `lead_completo`, `propiedad_seguimiento`, `bot_paused`, `handoff`, `senales_json`
- título planilla: `Nodo Propiedades CRM`
- pestañas: `Leads`, `Propiedades`, `Interacciones`, `Seguimientos`, `Errores`, `Leads_Bot`, `Consultas`, `Agenda_Visitas`, `Aprendizaje_Matias`
- pestaña destino existe: **sí**
- encabezados reales: `chat_id` | `nombre` | `zona` | `canal_origen` | `estado_seguimiento` | `ultima_actualizacion` | `temperature` | `presupuesto` | `lead_completo` | `dedupe_key` | `last_message` | `status` | `tipo_operacion` | `propiedad_seguimiento` | `lead_name` | `source`
- columnas mapeadas ausentes en encabezados: `bot_paused`, `handoff`, `senales_json`
- matching ausente: (ninguna)
- última evidencia de error del nodo: (no encontrado en las últimas 10 ejecuciones muestreadas)

## Registrar Consulta Telegram

- operation: `append`
- documentId: `1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ`
- sheetName: `Consultas`
- matchingColumns: (ninguna)
- columnas mapeadas: `anio`, `canal_origen`, `chat_id`, `consulta_id`, `es_nueva_consulta`, `fecha`, `fecha_local`, `intencion`, `lead_completo`, `mensaje_cliente`, `mes`, `nombre`, `operacion`, `presupuesto`, `respuesta_bot`, `temperature`, `zona`
- título planilla: `Nodo Propiedades CRM`
- pestañas: `Leads`, `Propiedades`, `Interacciones`, `Seguimientos`, `Errores`, `Leads_Bot`, `Consultas`, `Agenda_Visitas`, `Aprendizaje_Matias`
- pestaña destino existe: **sí**
- encabezados reales: `spreadsheetId` | `sheetId` | `title` | `index` | `sheetType` | `gridProperties`
- columnas mapeadas ausentes en encabezados: `anio`, `canal_origen`, `chat_id`, `consulta_id`, `es_nueva_consulta`, `fecha`, `fecha_local`, `intencion`, `lead_completo`, `mensaje_cliente`, `mes`, `nombre`, `operacion`, `presupuesto`, `respuesta_bot`, `temperature`, `zona`
- matching ausente: (ninguna)
- última evidencia de error del nodo: (no encontrado en las últimas 10 ejecuciones muestreadas)

## Registrar Aprendizaje Matias TG

- operation: `append`
- documentId: `1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ`
- sheetName: `Aprendizaje_Matias`
- matchingColumns: (ninguna)
- columnas mapeadas: `fecha`, `canal`, `contexto_cliente`, `respuesta_matias`, `zona`, `operacion`, `presupuesto`, `temperatura`, `intencion`, `patron`
- título planilla: `Nodo Propiedades CRM`
- pestañas: `Leads`, `Propiedades`, `Interacciones`, `Seguimientos`, `Errores`, `Leads_Bot`, `Consultas`, `Agenda_Visitas`, `Aprendizaje_Matias`
- pestaña destino existe: **sí**
- encabezados reales: `fecha` | `canal` | `contexto_cliente` | `respuesta_matias` | `zona` | `operacion` | `presupuesto` | `temperatura` | `intencion` | `patron`
- columnas mapeadas ausentes en encabezados: (ninguna)
- matching ausente: (ninguna)
- última evidencia de error del nodo: (no encontrado en las últimas 10 ejecuciones muestreadas)

## Google Sheets - Conversaciones_Revision TG

- operation: `append`
- documentId: `1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ`
- sheetName: `Conversaciones_Revision`
- matchingColumns: `chat_id`
- columnas mapeadas: `fecha_hora`, `canal`, `motivo`, `chat_id`, `lead_name`, `ultimo_mensaje_cliente`, `respuesta_bot`, `historial_json`, `mensajes_extra`
- título planilla: `Nodo Propiedades CRM`
- pestañas: `Leads`, `Propiedades`, `Interacciones`, `Seguimientos`, `Errores`, `Leads_Bot`, `Consultas`, `Agenda_Visitas`, `Aprendizaje_Matias`
- pestaña destino existe: **no**
- última evidencia de error del nodo: (no encontrado en las últimas 10 ejecuciones muestreadas)

## Extra — planilla del tag Guardar Lead (`18eZ…` / `Sheet1`)

- título: `leads_bot`
- pestañas: `Hoja 1`
- existe `Sheet1`: **no**
- encabezados `Hoja 1`: (vacío)

## Extra — hoja `Consultas` (prod)

- documentId: `1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ`
- encabezados: `spreadsheetId` | `sheetId` | `title` | `index` | `sheetType` | `gridProperties`
