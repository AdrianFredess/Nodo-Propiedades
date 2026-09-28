# Importacion Exacta en n8n

> **Estructura**: Los workflows estan en `workflows/`, los CSV en `csv/`, el prompt en `ai/`, los scripts en `scripts/`.

## Objetivo
Este documento te deja la secuencia minima y exacta para tener el sistema funcionando con la menor friccion posible.

## Camino recomendado
Si tu objetivo es salir a produccion con `Meta WhatsApp Cloud API`, toma como referencia principal:
- `LEER PRIMERO - Meta Produccion Final.md`
- `Stack Final Meta Produccion.md`

La ruta generica multicanal queda solo como respaldo.

## Workflow de entrada principal
Si vas a operar especificamente con `Meta WhatsApp Cloud API`, el archivo que debes exponer como webhook principal es:
- `WF-09B Meta WhatsApp Cloud Webhook Produccion.json`
- `WF-10 Meta Template Sender.json`
- `WF-11 Meta Status Handler.json`

Y registra en Meta este endpoint:
- `/webhook/meta-whatsapp-prod`

El workflow `WF-00 Orquestador Principal Importable.json` queda como opcion generica, no como camino recomendado.

## Workflows del sistema
Importa estos archivos para la version Meta final:
- `WF-02 Core Lead Processor.json`
- `WF-03 Property Matching.json`
- `WF-04 Follow-up Orchestrator.json`
- `WF-05 Daily Reactivation.json`
- `WF-06 Advisor Alert.json`
- `WF-07 Error Logger.json`
- `WF-08 Manual Lead Tester.json`
- `WF-09 Meta WhatsApp Cloud Webhook.json`
- `WF-09B Meta WhatsApp Cloud Webhook Produccion.json`
- `WF-10 Meta Template Sender.json`
- `WF-11 Meta Status Handler.json`

Como respaldo puedes conservar:
- `WF-00 Orquestador Principal Importable.json`
- `WF-01 Intake Multicanal.json`
- `WF-09 Meta WhatsApp Cloud Webhook.json`

## Sincronizar todos los workflows desde el repo (recomendado)
Con **n8n cerrado**, desde la raiz del proyecto:

```bash
node scripts/_sync_importar_todos_workflows.js
```

Esto importa los **15** JSON de `workflows/`, borra antes cualquier copia con el **mismo nombre** en tu `database.sqlite` (así no quedan viejos duplicados) y al final ejecuta la deduplicacion por nombre. Los JSON del repo **no se modifican** (se genera `workflow.id` solo en un archivo temporal; n8n 2.x lo exige).

Si usas otra carpeta de datos: `N8N_USER_FOLDER`.

Despues: `node scripts/_actualizar_ids_importados.js` (si lo usas en tu flujo).

Solo duplicados (mantener el mas nuevo por `updatedAt`): `node scripts/_eliminar_duplicados_workflows.js`

## Orden recomendado de importacion
1. `WF-07 Error Logger.json`
2. `WF-06 Advisor Alert.json`
3. `WF-03 Property Matching.json`
4. `WF-04 Follow-up Orchestrator.json`
5. `WF-05 Daily Reactivation.json`
6. `WF-02 Core Lead Processor.json`
7. `WF-08 Manual Lead Tester.json`
8. `WF-10 Meta Template Sender.json`
9. `WF-11 Meta Status Handler.json`
10. `WF-09B Meta WhatsApp Cloud Webhook Produccion.json`

## Despues de importar
1. Abrir cada workflow y copiar su ID interno.
2. Ejecutar `scripts/Reemplazar Placeholders.ps1`.
3. Volver a importar si decidiste reemplazar sobre archivos locales antes de subirlos, o reemplazar manualmente dentro de n8n si prefieres hacerlo en interfaz.

## Placeholders que debes completar
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

## Configuracion de Google Sheets
Usa el documento detectado en el proyecto:
- `1-0IBpaUl3svRmzMqNK0NYZYbuUDxCytnBd5Ql2DcOjo`

Hojas necesarias:
- `Leads`
- `Propiedades`
- `Seguimientos`
- `Interacciones`
- `Errores`

Importa primero los CSV:
- `csv/Google Sheets - Leads.csv`
- `csv/Google Sheets - Propiedades.csv`
- `csv/Google Sheets - Seguimientos.csv`
- `csv/Google Sheets - Interacciones.csv`
- `csv/Google Sheets - Errores.csv`

## Configuracion del nodo de IA
En `WF-02 Core Lead Processor.json`, abre:
- `AI Agent - Analyze Lead`

Luego:
1. pega `ai/Prompt AI Agent Inmobiliario.txt`,
2. conecta tu proveedor real de modelo,
3. prueba que devuelva JSON estricto.

## Configuracion Meta
Si vas con Meta, segui tambien:
- `Meta WhatsApp Cloud API - Setup.md`
- `Stack Final Meta Produccion.md`

## Prueba tecnica minima
### Opcion 1
Ejecuta:
- `WF-08 Manual Lead Tester.json`

### Opcion 2
Haz POST al webhook:
- `/webhook/meta-whatsapp-prod`

Payload minimo con estructura real de Meta:
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "changes": [
        {
          "value": {
            "metadata": {
              "phone_number_id": "1234567890"
            },
            "contacts": [
              {
                "profile": {
                  "name": "Juan Test"
                }
              }
            ],
            "messages": [
              {
                "from": "5491100009999",
                "id": "wamid.TEST",
                "timestamp": "1710000000",
                "text": {
                  "body": "Busco departamento en Caballito, hasta 120000 usd, para vivir."
                },
                "type": "text"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

## Resultado esperado
Debes ver:
- lead guardado en `Leads`,
- interaccion en `Interacciones`,
- score y temperatura asignados,
- mensaje outbound generado,
- seguimiento creado en `Seguimientos`,
- alerta interna si el lead sale caliente.

## Recomendacion operativa
Para salir rapido:
1. activa primero `WF-02`, `WF-03`, `WF-04`, `WF-06`, `WF-07`,
2. corre `WF-08 Manual Lead Tester`,
3. si todo sale bien, activa `WF-09B Meta WhatsApp Cloud Webhook Produccion.json`.

## Si n8n 2.x no deja importar WF-00, WF-02 o WF-09B

**Causas frecuentes**

1. **Nombre duplicado**: ya existe un workflow con el mismo nombre. Borralo en n8n o renombra el JSON antes de importar.
2. **Formato del nodo "Execute Sub-workflow"**: en n8n 2 el parametro `waitForSubWorkflow` debe ir dentro de `options`, no suelto.

**Solucion en el repo**

Desde la carpeta del proyecto:

```bash
node scripts/_fix_import_n8n2.js --all
```

Eso regenera IDs de nodos (UUID) y corrige los `Execute Workflow` en todos los JSON de `workflows/`. Luego volve a **Import from file**.

**Alternativa**: con n8n detenido, `n8n import:workflow --separate --input=workflows` y despues `node scripts/_actualizar_ids_importados.js`.
