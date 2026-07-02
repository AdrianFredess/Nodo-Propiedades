# Meta WhatsApp Cloud API - Setup

## Objetivo
Esta guia adapta el sistema a `Meta WhatsApp Cloud API`.

## Valores que necesitas desde Meta
- `Phone Number ID`
- `Access Token` preferentemente permanente
- `Verify Token` definido por vos para el webhook
- `App Secret` si luego queres validar firma `X-Hub-Signature-256`
- version Graph recomendada:
  - `v23.0`

## Donde sacar cada dato
### En Meta for Developers
- App creada
- Producto `WhatsApp` agregado
- Numero conectado

### En WhatsApp > API Setup
Vas a encontrar:
- `Phone number ID`
- `WhatsApp Business Account ID`
- token temporal o permanente segun configuracion

## Placeholders del paquete
Debes completar:
- `__SET_META_GRAPH_VERSION__`
- `__SET_META_PHONE_NUMBER_ID__`
- `__SET_META_ACCESS_TOKEN__`
- `__SET_META_VERIFY_TOKEN__`
- `__SET_META_APP_SECRET__`
- `__SET_ADVISOR_PHONE__`

## URL de envio ya contemplada en los workflows
Los workflows quedaron preparados para usar:
`https://graph.facebook.com/__SET_META_GRAPH_VERSION__/__SET_META_PHONE_NUMBER_ID__/messages`

## Payload de salida que usa el sistema
El envio ya esta adaptado a Meta con estructura:
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "5491100000000",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "Mensaje generado por el workflow"
  }
}
```

## Workflow especifico para inbound Meta
Importa:
- `WF-09B Meta WhatsApp Cloud Webhook Produccion.json`
- `WF-11 Meta Status Handler.json`
- `WF-10 Meta Template Sender.json`

Estos workflows resuelven:
- verificacion `GET` del webhook
- recepcion `POST` de mensajes
- parseo del mensaje entrante
- derivacion al `Core Lead Processor`
- captura de estados de entrega y lectura
- envio de templates fuera de la ventana de 24 horas

## Webhook que debes registrar en Meta
Usa la URL publica de tu instancia `n8n`:
- `https://TU_DOMINIO/webhook/meta-whatsapp-prod`

Meta hara:
- `GET` para verificar
- `POST` para enviar eventos

## Verify token
El valor que configures en Meta debe ser exactamente el mismo que pongas en:
- `__SET_META_VERIFY_TOKEN__`

## Campos que conviene subscribir en Meta
En el webhook de tu app, subscribi al menos:
- `messages`
- `message_template_status_update`
- `message_deliveries`
- `message_reads`

Para este sistema, el flujo usa principalmente:
- `messages`

## Prueba minima recomendada
1. Importar `WF-09B Meta WhatsApp Cloud Webhook Produccion.json`
2. Reemplazar placeholders
3. Activar workflow
4. Configurar webhook en Meta
5. Confirmar que el `GET` devuelve el challenge
6. Enviar un WhatsApp de prueba al numero conectado
7. Verificar que el lead llegue a `Leads`

## Importante sobre mensajes salientes
Si escribis fuera de la ventana de 24 horas:
- Meta puede exigir plantilla aprobada

Para esta version final del sistema:
- el flujo esta listo para mensajes de texto dentro de la ventana de atencion,
- el envio de plantillas ya esta contemplado en `WF-10 Meta Template Sender.json`.

## Recomendacion de produccion
1. usar access token permanente
2. no dejar token hardcodeado a largo plazo
3. mover credenciales a `n8n credentials` cuando cierres la version final
4. monitorear errores `400` y `401` de Graph API
