# Nodo Propiedades — Especificación del proyecto (OpenSpec)

**Qué es:** CRM inmobiliario automatizado en **n8n**: chatbots multicanal (WhatsApp, Messenger, Telegram) con inteligencia artificial integrada. Cada bot maneja su propio flujo de intake, scoring con **LLM (Groq)** y persistencia en **Google Sheets**.

**Repo raíz:** carpeta `Nodo Propiedades` (workflows JSON + scripts + docs).

---

## Layout del repositorio

| Ruta | Rol |
|------|-----|
| `workflows/` | Contiene los 3 workflows principales (`SIMPLE-01`, `SIMPLE-02`, `SIMPLE-03`). |
| `scripts/` | Utilidades para mantenimiento (sincronización, actualización de planilla, etc.). |
| `openspec/` | Este OpenSpec (contexto para IA). |
| `docs/` | Documentación de apoyo (Setup Google Sheets, etc.). |

---

## Workflows (activos)

Ver mapa actualizado en [`docs/n8n-esquema.md`](../docs/n8n-esquema.md).

| Archivo / nombre n8n | Canal | Rol |
|----------------------|-------|-----|
| `Bot Telegram Inmobiliaria.json` | **Telegram** | Flujo productivo TG |
| `SIMPLE-02 WhatsApp Bot.json` | **WhatsApp** | Meta Cloud API |
| `SIMPLE-03 Messenger Bot.json` | **Messenger** | Webhook Messenger |
| `SIMPLE-04 Seguimiento Automatico.json` | — | Follow-up tibios |
| `PANEL-01` … `PANEL-06` | Panel | API leads, broadcast, stock, realtime |

**Legacy:** `SIMPLE-01 Telegram Bot.json` — desactivar en n8n; no es el canal vivo.

**Notas técnicas comunes:**
**IA (Groq)**: analiza intención, califica temperatura (`frio` / `tibio` / `caliente`) y genera la respuesta. El score se recalcula en **cada mensaje** con señales (financiación, urgencia, presupuesto, zona, tipo+decisor); ver `docs/validacion/temperatura-leads.md`.
- **CRM (Google Sheets)**: Cada bot busca el lead por una `dedupe_key` (ej: `whatsapp:12345678`), crea el lead si no existe, y actualiza interacciones/temperatura.
- **Panel**: kanban por `temperature` (Frío/Tibio/Caliente); no gatea por `lead_completo`.
- **Estructura Sheets**: Se utiliza un documento de Google Sheets con hojas: `Leads`, `Propiedades`, `Interacciones`, etc.

---

## Placeholders `__SET_*__`

Estos valores deben configurarse en los nodos o sustituirse en el deploy:

| Placeholder | Uso típico |
|-------------|------------|
| `__SET_META_GRAPH_VERSION__` | Versión de la Graph API de Meta (v21.0, etc.). |
| `__SET_META_PHONE_NUMBER_ID__` | ID del número de teléfono en WhatsApp Cloud. |
| `__SET_META_ACCESS_TOKEN__` | Token de acceso (Bearer) de Meta. |
| `__SET_META_VERIFY_TOKEN__` | Token de verificación de webhooks (WhatsApp/Messenger). |

---

## Checklist de funcionamiento

1. **Google Sheets**: DocumentId configurado correctamente en los procesos de búsqueda/creación.
2. **Groq API**: Credencial configurada en el nodo `Groq Chat Model`.
3. **Webhooks**: Rutas configuradas en Meta y Telegram apuntando a la URL pública de n8n.
4. **Permisos de Meta**: Asegurar que el Access Token tenga permisos para `whatsapp_business_messaging`, `pages_messaging`, etc.

---

## MCP en Cursor (referencia)

- **`user-n8n`**: herramientas sobre instancia n8n local.
- **`user-openspec`**: la verdad funcional del proyecto reside en este archivo `openspec/PROJECT.md`.

*Última actualización: 21 de abril de 2026. Simplificación a 3 workflows.*

