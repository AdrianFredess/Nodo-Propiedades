# LEER PRIMERO - Meta Produccion Final

## Este es el paquete final recomendado
Si tu objetivo es salir rapido a produccion con `Meta WhatsApp Cloud API`, usa solamente el stack Meta final.

## Estructura del proyecto
```
Nodo Propiedades/
├── workflows/          # JSON de workflows n8n
├── docs/               # Documentacion
├── scripts/            # Scripts de configuracion
├── config/             # Configuracion base, manifiesto
├── ai/                 # Prompt, esquema y payloads del AI Agent
└── csv/                # CSV para importar a Google Sheets
```

## Archivos que SI debes usar
- `workflows/WF-07 Error Logger.json`
- `workflows/WF-06 Advisor Alert.json`
- `workflows/WF-03 Property Matching.json`
- `workflows/WF-04 Follow-up Orchestrator.json`
- `workflows/WF-05 Daily Reactivation.json`
- `workflows/WF-10 Meta Template Sender.json`
- `workflows/WF-11 Meta Status Handler.json`
- `workflows/WF-02 Core Lead Processor.json`
- `workflows/WF-08 Manual Lead Tester.json`
- `workflows/WF-09B Meta WhatsApp Cloud Webhook Produccion.json`
- `workflows/WF-12 Messenger Webhook.json` (Messenger / Marketplace)
- `workflows/WF-13 Telegram Bot Webhook.json` (Telegram)
- `config/Configuracion Base.example.json`
- `ai/Prompt AI Agent Inmobiliario.txt`
- `docs/Configurar Ollama - AI Agent.md`
- `scripts/_setup_ollama_completo.ps1` (script automatico: instala Ollama, descarga modelo, actualiza prompt)
- `ai/AI Output Schema.json`
- `csv/Google Sheets - Leads.csv`
- `csv/Google Sheets - Propiedades.csv`
- `csv/Google Sheets - Seguimientos.csv`
- `csv/Google Sheets - Interacciones.csv`
- `csv/Google Sheets - Errores.csv`
- `scripts/Reemplazar Placeholders.ps1`

## Archivos que puedes ignorar por ahora
- `workflows/WF-00 Orquestador Principal Importable.json`
- `workflows/WF-01 Intake Multicanal.json`
- `workflows/WF-09 Meta WhatsApp Cloud Webhook.json`
- `docs/Blueprint Sistema Inmobiliario n8n.md`

`workflows/WF-10 Meta Template Sender.json` si forma parte del stack final, pero solo se usa cuando salis de la ventana de 24 horas.

## Orden correcto
1. importar CSV de `csv/` a Google Sheets
2. importar workflows del stack Meta final desde `workflows/`
3. **con n8n cerrado** o **luego refrescar**: ejecutar `node scripts/_actualizar_ids_importados.js` (enlaza Execute Workflow al Core real; evita errores de flujo no encontrado)
4. ejecutar `node scripts/_verificar_referencias.js` (debe decir sin problemas; si hay duplicados de nombre en n8n, borrar el extra)
5. ejecutar `scripts/Reemplazar Placeholders.ps1` (Meta, Telegram, etc. en los JSON si importas de archivo de nuevo)
6. cerrar n8n y ejecutar `scripts/_setup_ollama_completo.ps1` (instala Ollama, descarga modelo, actualiza prompt)
7. abrir n8n, en WF-02 agregar Ollama Chat Model al nodo AI Agent (ver `docs/Configurar Ollama - AI Agent.md`)
8. WF-08: para probar envio real por WhatsApp, en el Set poner `source` = `whatsapp` y `channel_reply_target` = numero E.164 (si no, el Switch va a fallback y solo registra en Sheets)
9. correr WF-08 Manual Lead Tester
10. activar WF-09B (y WF-12 / WF-13 si usas Messenger o Telegram)
11. configurar webhook en Meta (y Telegram setWebhook si aplica)

## Endpoint final recomendado
- `/webhook/meta-whatsapp-prod`

## Documentos de apoyo que si conviene leer
- `docs/Stack Final Meta Produccion.md`
- `docs/Importacion Exacta en n8n.md`
- `docs/Meta WhatsApp Cloud API - Setup.md`
- `docs/Meta Ventana 24h y Templates.md`
- `docs/Setup Messenger y Telegram.md` (Messenger, Telegram, Marketplace)

## Regla simple
- dentro de 24h: mensajes normales
- fuera de 24h: plantilla con `WF-10`
