# Blueprint Sistema Inmobiliario n8n

## 1. Resumen ejecutivo
Este sistema esta disenado para inmobiliarias o captadores de propiedades de terceros que necesitan filtrar curiosos, acelerar la respuesta inicial y derivar solo oportunidades reales al asesor humano. La arquitectura usa `n8n` como orquestador, `Google Sheets` como CRM inicial, `AI Agent` para interpretacion comercial, `Wait` para seguimiento y `HTTP Request` para integraciones de mensajeria.

La implementacion correcta no debe ser un chatbot unico. Debe dividirse en modulos:
- captacion multicanal,
- normalizacion y deduplicacion,
- enriquecimiento con IA,
- scoring,
- matching de propiedades,
- seguimiento automatico,
- derivacion al asesor,
- logging y control operativo.

Objetivos operativos:
- responder en menos de 1 minuto,
- obtener presupuesto, zona, forma de pago, urgencia y objetivo de compra,
- evitar que el asesor pierda tiempo con leads vagos,
- aumentar visitas coordinadas,
- dejar una estructura escalable para pasar luego a base de datos o CRM formal.

## 2. Arquitectura general
### Vista de punta a punta
1. `WF-01 Canal Intake`: recibe leads desde WhatsApp, formulario, Meta, Instagram/Facebook, portales o carga manual.
2. `WF-02 Normalizacion`: transforma todos los canales al mismo formato interno.
3. `WF-03 Lead Processor`: valida, deduplica, registra en CRM y llama a la IA.
4. `WF-04 AI Qualification`: interpreta intencion, calcula score, define temperatura y accion siguiente.
5. `WF-05 Property Matching`: busca propiedades exactas o similares.
6. `WF-06 Messaging`: responde por el canal correcto con CTA concreto.
7. `WF-07 Follow-up Orchestrator`: agenda y ejecuta seguimientos a 24h, 3 dias, 7 dias y reactivaciones.
8. `WF-08 Advisor Alert`: avisa al asesor con resumen accionable cuando el lead esta listo.
9. `WF-09 Error Logging`: registra fallos, payloads invalidos y reintentos.

### Principios de diseno
- Nunca mezclar payloads crudos de distintos canales sin normalizarlos primero.
- Toda clasificacion de IA debe pasar por validacion dura en n8n.
- Todo mensaje enviado debe dejar traza en CRM.
- Los seguimientos deben reconsultar estado antes de enviar.
- La derivacion humana debe ser una consecuencia de reglas y no solo de texto libre.

### Formato interno canonico del lead
```json
{
  "lead_id": "ld_20260318_0001",
  "source": "whatsapp",
  "source_campaign": "meta_palermo_venta",
  "lead_name": "Juan Perez",
  "phone": "+5491122334455",
  "email": null,
  "message": "Busco depto 3 ambientes en Caballito hasta 130 mil usd",
  "property_ref": null,
  "timestamp": "2026-03-18T10:30:00-03:00",
  "channel_reply_target": "+5491122334455",
  "raw_payload": {}
}
```

## 3. Workflow principal nodo por nodo
Workflow recomendado: `WF-03 Lead Processor`.

### Nodo 1: `Trigger - Core Entry`
- Tipo: `Webhook` o `Execute Workflow Trigger`
- Funcion: recibir el lead ya normalizado desde cada canal.
- Recibe: payload interno canonico.
- Devuelve: item del lead.
- Conexion: `Set - Canonical Cleanup`

### Nodo 2: `Set - Canonical Cleanup`
- Tipo: `Set`
- Funcion: limpiar espacios, bajar ruido y asegurar defaults.
- Recibe: lead crudo.
- Devuelve:
  - `lead_name`
  - `phone`
  - `email`
  - `message`
  - `source`
  - `source_campaign`
  - `property_ref`
  - `timestamp`
- Conexion: `Code - Build IDs`

### Nodo 3: `Code - Build IDs`
- Tipo: `Code`
- Funcion: crear `lead_id`, `dedupe_key`, `created_at`, `updated_at`.
- Recibe: campos limpios.
- Devuelve:
  - `lead_id`
  - `dedupe_key`
  - `normalized_phone`
  - `normalized_email`
  - `created_at`
  - `updated_at`
- Conexion: `Google Sheets - Lookup Lead`

### Nodo 4: `Google Sheets - Lookup Lead`
- Tipo: `Google Sheets`
- Funcion: buscar si el lead ya existe por `dedupe_key`, telefono o email.
- Recibe: `dedupe_key`, `phone`, `email`.
- Devuelve: fila existente o vacia.
- Conexion: `IF - Existing Lead`

### Nodo 5: `IF - Existing Lead`
- Tipo: `IF`
- Funcion: decidir creacion o actualizacion.
- Rama `true`: `Google Sheets - Update Lead`
- Rama `false`: `Google Sheets - Create Lead`

### Nodo 6A: `Google Sheets - Create Lead`
- Tipo: `Google Sheets`
- Funcion: agregar lead nuevo a hoja `Leads`.
- Recibe: lead canonico.
- Devuelve: fila creada.
- Conexion: `Merge - Upsert Result`

### Nodo 6B: `Google Sheets - Update Lead`
- Tipo: `Google Sheets`
- Funcion: actualizar `updated_at`, `last_message`, `last_interaction_at`, `source`.
- Recibe: id de fila y nuevos datos.
- Devuelve: fila actualizada.
- Conexion: `Merge - Upsert Result`

### Nodo 7: `Merge - Upsert Result`
- Tipo: `Merge`
- Funcion: unificar ramas nuevo/existente.
- Recibe: salida de create o update.
- Devuelve: lead persistido.
- Conexion: `Google Sheets - Log Interaction`

### Nodo 8: `Google Sheets - Log Interaction`
- Tipo: `Google Sheets`
- Funcion: registrar la interaccion entrante en `Interacciones`.
- Recibe:
  - `lead_id`
  - `timestamp`
  - `direction = inbound`
  - `channel`
  - `message_raw`
- Devuelve: log creado.
- Conexion: `Google Sheets - Lookup Properties Context`

### Nodo 9: `Google Sheets - Lookup Properties Context`
- Tipo: `Google Sheets`
- Funcion: traer resumen liviano de propiedades activas para ayudar al AI Agent.
- Recibe: filtros generales o consulta por `property_ref`.
- Devuelve: `matched_properties_summary` resumido.
- Conexion: `AI Agent - Analyze Lead`

### Nodo 10: `AI Agent - Analyze Lead`
- Tipo: `AI Agent` o nodo de IA equivalente
- Funcion: interpretar intencion comercial y devolver JSON estructurado.
- Recibe:
  - datos del lead,
  - historial resumido,
  - estado actual,
  - resumen de propiedades.
- Devuelve:
  - `lead_intent`
  - `buyer_profile`
  - `extracted_data`
  - `missing_fields`
  - `lead_score`
  - `lead_temperature`
  - `next_best_action`
  - `customer_message`
  - `advisor_summary`
- Conexion: `Code - Validate AI Output`

### Nodo 11: `Code - Validate AI Output`
- Tipo: `Code`
- Funcion: validar JSON, completar nulls y aplicar reglas duras.
- Recibe: salida del AI Agent.
- Devuelve:
  - JSON validado,
  - score corregido si hay incoherencias,
  - motivo de descarte si aplica.
- Reglas duras recomendadas:
  - si no hay telefono ni email, no derivar,
  - si `do_not_contact = true`, cancelar todo,
  - si pregunta por alquiler y el funnel es venta, marcar como desviado,
  - si el score es alto pero faltan todos los datos criticos, bajar a `tibio`.
- Conexion: `Google Sheets - Update Qualification`

### Nodo 12: `Google Sheets - Update Qualification`
- Tipo: `Google Sheets`
- Funcion: guardar score, temperatura, datos extraidos, faltantes y resumen IA.
- Recibe: salida validada.
- Devuelve: lead enriquecido.
- Conexion: `Switch - Commercial Route`

### Nodo 13: `Switch - Commercial Route`
- Tipo: `Switch`
- Funcion: enrutar la accion segun temperatura y accion siguiente.
- Ramas:
  - `frio`
  - `tibio`
  - `calificado`
  - `caliente`

### Nodo 14A: `Set - Reply Cold`
- Tipo: `Set`
- Funcion: definir mensaje corto de filtro y seguimiento suave.
- Conexion: `HTTP Request - Send Outbound`

### Nodo 14B: `Set - Reply Warm`
- Tipo: `Set`
- Funcion: pedir datos faltantes clave o enviar opciones preliminares.
- Conexion: `HTTP Request - Send Outbound`

### Nodo 14C: `Execute Workflow - Property Matching`
- Tipo: `Execute Workflow`
- Funcion: obtener shortlist exacta o similar.
- Recibe:
  - `preferred_zones`
  - `budget_amount`
  - `budget_currency`
  - `property_type`
  - `bedrooms`
  - `operation_type`
- Devuelve: lista de 3 a 5 propiedades.
- Conexion: `Set - Reply Qualified`

### Nodo 14D: `Execute Workflow - Property Matching Hot`
- Tipo: `Execute Workflow`
- Funcion: mismo matching pero preparado para derivacion inmediata.
- Conexion: `Set - Reply Hot`

### Nodo 15A: `Set - Reply Qualified`
- Tipo: `Set`
- Funcion: construir mensaje con shortlist y CTA a visita/llamada.
- Devuelve: `final_customer_message`.
- Conexion: `HTTP Request - Send Outbound`

### Nodo 15B: `Set - Reply Hot`
- Tipo: `Set`
- Funcion: construir mensaje corto y confirmar que el asesor tomara el caso.
- Devuelve: `final_customer_message`.
- Conexion:
  - `HTTP Request - Send Outbound`
  - `Execute Workflow - Advisor Alert`

### Nodo 16: `HTTP Request - Send Outbound`
- Tipo: `HTTP Request`
- Funcion: enviar respuesta por WhatsApp API, Meta, email o integrador.
- Recibe:
  - canal,
  - destinatario,
  - mensaje,
  - metadata.
- Devuelve: estado de envio.
- Conexion: `Google Sheets - Log Outbound`

### Nodo 17: `Google Sheets - Log Outbound`
- Tipo: `Google Sheets`
- Funcion: registrar el mensaje saliente.
- Recibe:
  - `lead_id`
  - `direction = outbound`
  - `message_sent`
  - `channel`
  - `timestamp`
- Devuelve: log guardado.
- Conexion: `Set - Follow-up Decision`

### Nodo 18: `Set - Follow-up Decision`
- Tipo: `Set`
- Funcion: definir si hay que crear seguimiento y cuando.
- Recibe:
  - temperatura,
  - next action,
  - si hubo envio exitoso.
- Devuelve:
  - `should_schedule_followup`
  - `followup_type`
  - `followup_in_hours`
- Conexion: `IF - Needs Follow-up`

### Nodo 19: `IF - Needs Follow-up`
- Tipo: `IF`
- Funcion: crear o no tarea de seguimiento.
- Rama `true`: `Google Sheets - Create Follow-up`
- Rama `false`: fin.

### Nodo 20: `Google Sheets - Create Follow-up`
- Tipo: `Google Sheets`
- Funcion: insertar tarea en hoja `Seguimientos`.
- Recibe:
  - `lead_id`
  - `scheduled_at`
  - `followup_type`
  - `channel`
  - `status = pending`
- Devuelve: seguimiento creado.
- Conexion: fin.

## 4. Subworkflows recomendados
### `WF-01 Intake WhatsApp`
- Trigger: webhook del proveedor.
- Tareas:
  - validar firma si el proveedor la soporta,
  - mapear numero y mensaje,
  - detectar si es texto, audio transcripto o plantilla,
  - emitir al workflow central.

### `WF-01B Intake Web Form`
- Trigger: `Webhook`.
- Tareas:
  - recibir formulario,
  - limpiar campos vacios,
  - mapear nombre, telefono, email, zona y mensaje.

### `WF-01C Intake Meta Lead Ads`
- Trigger: `Webhook` desde integracion o polling externo.
- Tareas:
  - mapear campos del formulario de Meta,
  - guardar `ad_id`, `campaign`, `adset`,
  - enviar al core.

### `WF-01D Intake Portal Inmobiliario`
- Trigger: `Webhook` o email parser si el portal no ofrece API.
- Tareas:
  - identificar propiedad consultada,
  - normalizar contacto,
  - marcar alta prioridad si pregunta por una ficha puntual.

### `WF-04 Property Matching`
- Entrada: lead ya calificado.
- Pasos:
  - buscar coincidencia exacta por zona, precio y tipo,
  - ampliar margen de presupuesto de `-10% / +10%` si no hay match,
  - probar zonas cercanas,
  - devolver maximo 5 resultados ordenados.

### `WF-05 Follow-up Orchestrator`
- Entrada: nuevo seguimiento pendiente.
- Pasos:
  - `Wait` hasta `scheduled_at`,
  - buscar nuevamente el lead,
  - cancelar si `visit_scheduled = true`, `do_not_contact = true` o `status = closed`,
  - construir mensaje segun tipo,
  - enviar,
  - registrar resultado,
  - decidir proximo seguimiento.

### `WF-06 Reactivacion`
- Trigger: `Schedule Trigger` diario.
- Busca leads:
  - sin respuesta hace 15, 30 o 45 dias,
  - que alguna vez fueron `tibio` o mas,
  - que no esten cerrados ni rechazados.
- Accion:
  - ofrecer novedad,
  - ofrecer oportunidad similar,
  - preguntar si sigue activo.

### `WF-07 Advisor Alert`
- Entrada: lead caliente o calificado con CTA aceptado.
- Accion:
  - enviar resumen al asesor por WhatsApp, email o Slack,
  - incluir ficha sintetica,
  - incluir proximos pasos sugeridos.

### `WF-08 Error Logging`
- Entrada: cualquier `Error Trigger` o rama de control.
- Accion:
  - registrar workflow,
  - nodo fallido,
  - payload,
  - timestamp,
  - accion sugerida.

## 5. CRM en Google Sheets
### Hoja `Leads`
Columnas:
- `lead_id`
- `dedupe_key`
- `created_at`
- `updated_at`
- `source`
- `source_campaign`
- `lead_name`
- `phone`
- `email`
- `city`
- `lead_intent`
- `buyer_profile`
- `operation_type`
- `property_type`
- `preferred_zones`
- `bedrooms`
- `budget_amount`
- `budget_currency`
- `payment_method`
- `urgency_level`
- `timeframe_days`
- `property_ref`
- `current_score`
- `temperature`
- `status`
- `missing_fields`
- `last_message`
- `last_interaction_at`
- `assigned_advisor`
- `advisor_notified`
- `visit_scheduled`
- `next_followup_at`
- `do_not_contact`
- `disqualification_reason`
- `notes_ai_summary`

### Hoja `Propiedades`
Columnas:
- `property_id`
- `external_ref`
- `title`
- `operation_type`
- `property_type`
- `address`
- `zone`
- `city`
- `bedrooms`
- `bathrooms`
- `area_m2`
- `price`
- `currency`
- `expenses`
- `features`
- `payment_options`
- `status`
- `publication_link`
- `advisor_owner`
- `updated_at`

### Hoja `Seguimientos`
Columnas:
- `followup_id`
- `lead_id`
- `created_at`
- `scheduled_at`
- `followup_type`
- `channel`
- `message_template`
- `status`
- `attempt_number`
- `result`
- `advisor_required`
- `closed_reason`

### Hoja `Interacciones`
Columnas:
- `interaction_id`
- `lead_id`
- `timestamp`
- `direction`
- `channel`
- `message_raw`
- `message_sent`
- `ai_detected_intent`
- `score_after_interaction`
- `temperature_after_interaction`

### Hoja `Errores`
Columnas:
- `error_id`
- `workflow_name`
- `node_name`
- `lead_id`
- `timestamp`
- `error_message`
- `payload_snapshot`
- `status`

## 6. Sistema de scoring
### Escala
- `0-29`: frio
- `30-54`: tibio
- `55-79`: calificado
- `80-100`: caliente

### Variables que suman
- `+20` presupuesto claro
- `+15` zona definida
- `+10` tipo de propiedad definido
- `+10` operacion concreta
- `+15` urgencia real en 0 a 60 dias
- `+15` forma de pago viable
- `+10` responde preguntas clave
- `+10` acepta llamada, visita o recibir opciones
- `+10` consulta una propiedad especifica
- `+5` deja canal alternativo de contacto
- `+10` comprador para vivir con necesidad concreta o inversor con criterio claro

### Variables que restan
- `-20` no aporta ningun dato util
- `-15` mensaje puramente curioso
- `-15` presupuesto muy fuera de mercado
- `-10` no responde primer seguimiento
- `-15` busqueda demasiado vaga
- `-20` dice explicitamente que solo esta mirando
- `-30` datos falsos o contacto imposible
- `-15` intencion fuera del embudo de venta
- `-10` inconsistencias serias entre deseo, ticket y viabilidad

### Regla de correccion
Aunque el score numerico de mas de `80` sugiera `caliente`, no clasificar como caliente si faltan dos o mas campos criticos entre:
- presupuesto,
- zona,
- forma de pago,
- siguiente paso aceptado.

## 7. Logica de decision comercial
### Lead frio
- Mensaje inmediato.
- Pedir maximo 2 o 3 datos.
- Programar seguimiento a 24h.
- Si no responde, pasar a pausa y luego reactivacion.
- Nunca derivar al asesor salvo que reaccione con datos concretos.

### Lead tibio
- Completar faltantes criticos.
- Ofrecer ayuda precisa, no una ficha interminable.
- Seguimiento a 24h y 3 dias.
- Si contesta y mejora score, reingresa a matching.

### Lead calificado
- Enviar shortlist de 3 a 5 propiedades.
- CTA directo a llamada o visita.
- Crear alerta comercial diferida si hay buena senal.
- Seguimiento a 24h o 48h segun urgencia.

### Lead caliente
- Mensaje corto de contencion.
- Alerta inmediata al asesor.
- Evitar demasiadas automatizaciones posteriores.
- Si el asesor no responde en el SLA, escalar a backup comercial.

## 8. Mensajes automaticos ejemplo
### Primer contacto
`Hola, {{lead_name}}. Gracias por escribirnos. Para pasarte opciones que realmente te sirvan, decime por favor zona, presupuesto aproximado y si buscas para vivir o invertir.`

### Pedido de datos faltantes
`Perfecto. Me falta solo esto para filtrarte bien: {{missing_fields_human}}. Asi te paso opciones concretas y no te hago perder tiempo.`

### Invitacion a visita
`Vi opciones que encajan bastante con lo que buscas. Si queres, coordinamos una visita esta semana y te comparto primero las mejores.`

### Seguimiento a 24 horas
`Te escribo para saber si seguis buscando en {{preferred_zone}}. Si queres, hoy mismo te envio una seleccion mas precisa segun tu presupuesto.`

### Seguimiento a 3 dias
`Todavia tengo algunas opciones que pueden servirte. Si seguis activo en la busqueda, te priorizo las mas alineadas y vemos una visita.`

### Reactivacion
`Hola, {{lead_name}}. Entraron propiedades nuevas en {{preferred_zone}} y pense que podian interesarte. Si seguis buscando, te mando una seleccion corta.`

### Derivacion al asesor
`Por tu busqueda, ya te va a escribir {{advisor_name}}, que puede ayudarte a avanzar con opciones concretas y coordinar visita si te interesa.`

## 9. Prompt maestro para AI Agent
El prompt listo para pegar esta en `Prompt AI Agent Inmobiliario.txt`. Debe usarse con salida JSON estricta y validacion posterior en n8n.

## 10. JSON esperado
El esquema exacto esta en `AI Output Schema.json`.

## 11. Payloads de prueba
Los payloads listos para probar estan en `Payloads de prueba.json`.

## 12. Casos reales simulados
### Caso 1: lead curioso
Entrada:
- `Hola, cuanto sale ese depto?`

Salida esperada:
- score bajo,
- temperatura `frio`,
- pedir presupuesto, zona y objetivo,
- no derivar.

### Caso 2: lead con potencial
Entrada:
- `Busco 3 ambientes en Caballito o Parque Chacabuco, hasta 125 mil usd. Queremos avanzar este trimestre.`

Salida esperada:
- score medio-alto,
- temperatura `calificado`,
- falta forma de pago,
- enviar opciones y pedir dato faltante.

### Caso 3: lead caliente
Entrada:
- `Vi la propiedad CAB-203. Tengo USD 140.000 y quiero visitar esta semana.`

Salida esperada:
- score alto,
- temperatura `caliente`,
- alertar asesor,
- confirmar visita.

## 13. Recomendaciones para produccion
1. Mantener separados los workflows de intake, scoring, seguimiento y alertas.
2. Implementar idempotencia con `dedupe_key` y control de reintentos.
3. Validar siempre la salida de IA con un nodo `Code`.
4. No enviar mensajes si el estado del lead cambio despues del `Wait`.
5. Agregar logs de error y de negocio, no solo tecnicos.
6. Medir:
   - tiempo de primera respuesta,
   - tasa de respuesta al primer mensaje,
   - tasa de leads calificados,
   - tasa de visita,
   - tasa de cierre.
7. Documentar SLA del asesor:
   - caliente: 10 minutos,
   - calificado con CTA: 2 horas,
   - tibio: manejo automatico hasta demostrar interes real.
8. Limitar la automatizacion cuando un humano ya tomo el caso.
9. Revisar mensualmente scoring y prompts con conversaciones reales.
10. Migrar de `Google Sheets` a base de datos o CRM formal cuando el volumen empiece a generar bloqueos o concurrencia.

## Implementacion minima sugerida
### Fase 1
- WhatsApp
- Formulario web
- Google Sheets
- scoring IA
- seguimiento 24h y 3 dias

### Fase 2
- Meta Lead Ads
- portal inmobiliario
- matching de propiedades
- alerta a asesor

### Fase 3
- reactivacion avanzada
- panel operativo
- SLA y reportes
