# Implementacion y Runbook

## Objetivo
Este paquete deja una base casi desplegable para un sistema de captacion, filtrado, scoring, seguimiento y derivacion comercial en `n8n` orientado a venta de propiedades.

## Archivos incluidos
- `WF-01 Intake Multicanal.json`
- `WF-02 Core Lead Processor.json`
- `WF-03 Property Matching.json`
- `WF-04 Follow-up Orchestrator.json`
- `WF-05 Daily Reactivation.json`
- `WF-06 Advisor Alert.json`
- `WF-07 Error Logger.json`
- `Configuracion Base.example.json`
- `Prompt AI Agent Inmobiliario.txt`
- `AI Output Schema.json`
- `Payloads de prueba.json`
- `Google Sheets - Leads.csv`
- `Google Sheets - Propiedades.csv`
- `Google Sheets - Seguimientos.csv`
- `Google Sheets - Interacciones.csv`
- `Google Sheets - Errores.csv`

## Orden correcto de implementacion
1. Crear o limpiar el Google Sheet.
2. Crear las hojas:
   - `Leads`
   - `Propiedades`
   - `Seguimientos`
   - `Interacciones`
   - `Errores`
3. Importar los CSV provistos en cada hoja.
4. En `n8n`, crear credenciales:
   - `Google Sheets OAuth2`
   - `HTTP Header Auth` o credencial equivalente para WhatsApp API
   - credencial del modelo IA si vas a usar OpenAI, Anthropic o proveedor compatible
5. Importar los workflows en este orden:
   - `WF-07 Error Logger`
   - `WF-06 Advisor Alert`
   - `WF-03 Property Matching`
   - `WF-04 Follow-up Orchestrator`
   - `WF-05 Daily Reactivation`
   - `WF-02 Core Lead Processor`
   - `WF-01 Intake Multicanal`
6. Abrir `Configuracion Base.example.json` y copiar valores reales.
7. Reemplazar placeholders en los workflows:
   - `__SET_CORE_WORKFLOW_ID__`
   - `__SET_PROPERTY_MATCHING_WORKFLOW_ID__`
   - `__SET_FOLLOWUP_WORKFLOW_ID__`
   - `__SET_ADVISOR_ALERT_WORKFLOW_ID__`
   - `__SET_META_STATUS_HANDLER_WORKFLOW_ID__`
   - `__SET_META_TEMPLATE_SENDER_WORKFLOW_ID__`
   - `__SET_META_GRAPH_VERSION__`
   - `__SET_META_PHONE_NUMBER_ID__`
   - `__SET_META_ACCESS_TOKEN__`
   - `__SET_META_VERIFY_TOKEN__`
   - `__SET_META_APP_SECRET__`
   - `__SET_ADVISOR_PHONE__`
8. Pegar el contenido de `Prompt AI Agent Inmobiliario.txt` en el nodo `AI Agent - Analyze Lead`.
9. Ajustar el proveedor del nodo de IA segun tu stack real.
10. Activar primero los workflows internos y al final el de intake.

## Cableado recomendado entre workflows
- `WF-01 Intake Multicanal` llama a `WF-02 Core Lead Processor`
- `WF-02 Core Lead Processor` llama a:
  - `WF-03 Property Matching`
  - `WF-04 Follow-up Orchestrator`
  - `WF-06 Advisor Alert`
- `WF-05 Daily Reactivation` llama a `WF-04 Follow-up Orchestrator`
- `WF-07 Error Logger` debe quedar activo como captura transversal

## Configuracion del AI Agent
### Entrada recomendada
El nodo de IA debe recibir:
- lead canonico
- resumen de interacciones previas
- estado actual del lead
- resumen simple de propiedades si existe

### Salida obligatoria
La salida debe cumplir `AI Output Schema.json`.

### Regla critica
Siempre pasar la salida del nodo IA por `Code - Validate AI Output`. Nunca usar la salida del modelo directamente para enviar mensajes o derivar al asesor.

## Configuracion de Google Sheets
### Hojas operativas
- `Leads`: estado maestro del lead
- `Propiedades`: catalogo activo
- `Seguimientos`: cola operativa
- `Interacciones`: trazabilidad completa
- `Errores`: auditoria tecnica

### Regla operativa
No editar manualmente columnas de sistema salvo:
- `assigned_advisor`
- `status`
- `visit_scheduled`
- `do_not_contact`

## Configuracion de mensajeria
### WhatsApp
El `HTTP Request` debe adaptarse a tu proveedor real:
- Meta Cloud API
- Twilio
- WATI
- Z-API
- UltraMsg

Campos minimos:
- destinatario
- texto
- referencia interna del lead

### Instagram / Facebook / otros
Si el canal no soporta respuesta directa simple:
- usar intake solo para captacion,
- mover la respuesta principal a WhatsApp o email,
- registrar en `source` y `source_campaign`.

## Como probar el sistema
### Prueba 1: lead curioso
- Enviar uno de los payloads frios.
- Esperar:
  - score bajo
  - mensaje pidiendo datos
  - sin alerta al asesor

### Prueba 2: lead con potencial
- Enviar payload intermedio.
- Esperar:
  - score `55+`
  - shortlist o pedido puntual de forma de pago
  - seguimiento agendado

### Prueba 3: lead caliente
- Enviar payload de propiedad puntual y voluntad de visita.
- Esperar:
  - score `80+`
  - mensaje corto
  - alerta interna al asesor
  - seguimiento rapido

### Prueba 4: duplicado
- Reenviar el mismo lead.
- Esperar:
  - no crear nuevo lead util,
  - si queres mantener historial, solo nueva interaccion.

### Prueba 5: desvio de funnel
- Enviar un lead de alquiler o tasacion.
- Esperar:
  - `outside_funnel` o descarte,
  - no derivacion al asesor de ventas.

## Ajustes comerciales obligatorios antes de publicar
1. Revisar mensajes para que coincidan con el tono de tu marca.
2. Revisar el scoring con conversaciones reales.
3. Cargar al menos 20 a 50 propiedades activas y bien etiquetadas.
4. Validar que los precios, zonas y estados de propiedad esten actualizados.
5. Definir claramente cuando un lead cambia a:
   - `nuevo`
   - `abierto`
   - `precalificado`
   - `visitado`
   - `cerrado`
   - `descartado`

## Operacion diaria recomendada
### Responsable de automatizacion
- Revisar `Errores`
- Revisar tiempos de respuesta
- Revisar ejecuciones fallidas

### Responsable comercial
- Tomar alertas calientes en menos de 10 minutos
- Completar `assigned_advisor`
- Marcar `visit_scheduled` cuando corresponda
- Cerrar estado cuando el lead ya no necesite automatizacion

## KPIs que debes medir desde el dia 1
- tiempo medio de primera respuesta
- porcentaje de leads con datos completos
- tasa de leads calificados
- tasa de derivacion humana
- tasa de visita coordinada
- tasa de cierre
- tasa de respuesta al seguimiento 24h
- tasa de reactivacion efectiva

## Riesgos reales y como evitarlos
### 1. Duplicados
Solucion:
- usar `dedupe_key` por telefono o email
- si no hay telefono ni email, no confiar en el lead

### 2. IA demasiado optimista
Solucion:
- reglas duras en nodo `Code`
- score corregido si faltan campos criticos

### 3. Seguimientos molestos
Solucion:
- reconsultar lead antes de enviar
- frenar mensajes si `visit_scheduled` o `do_not_contact`

### 4. Catalogo malo
Solucion:
- mantener `Propiedades` al dia
- no sugerir inmuebles cerrados o reservados

### 5. Derivacion tardia
Solucion:
- SLA interno
- backup de asesor si no responde

## Siguiente nivel recomendado
Cuando esto funcione durante 2 a 4 semanas, conviene sumar:
- panel de metricas
- base de datos real
- etiquetado automatico por campana
- A/B testing de mensajes
- priorizacion por rentabilidad esperada
