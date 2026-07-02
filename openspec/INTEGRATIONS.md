# Integraciones externas

## Groq (IA en SIMPLE-01/02/03)

- **Modelo:** `llama-3.1-70b-versatile` vía nodo `Groq Chat Model`.
- **Credencial n8n:** OpenAI API, nombre sugerido `Groq API`, base URL `https://api.groq.com/openai/v1`, API key de [console.groq.com](https://console.groq.com).
- **Costo:** Tier gratuito o según uso de tokens en Groq.

## Meta — WhatsApp Cloud API

- **Envío:** HTTP Request en `SIMPLE-02` a `graph.facebook.com/{GRAPH_VERSION}/{PHONE_NUMBER_ID}/messages`.
- **Webhook:** Verificación vía `GET` y recepción de mensajes vía `POST` en el mismo bot.
- **Configuración**: Requiere `__SET_META_VERIFY_TOKEN__` para validar la suscripción.

## Meta — Messenger

- **Envío:** HTTP Request en `SIMPLE-03` a `graph.facebook.com/{GRAPH_VERSION}/me/messages`.
- **Configuración**: Mismo token de página que gestiona la mensajería de la página de Facebook.

## Telegram

- **Envío:** Nodo Telegram en `SIMPLE-01` configurado con el bot `@nodoprop_bot`.
- **Webhook**: Configurado para recibir actualizaciones de tipo `message`.

## Google Sheets

- **ID de planilla**: Valor canónico fijado en los nodos de cada bot. Centraliza leads y trazabilidad.
- **Credencial**: OAuth2 de Google en n8n.

## Variables de entorno

Ver `.env.example` para configuraciones generales de n8n. Los bots utilizan predominantemente los placeholders `__SET_*__` inyectados en los nodos o configurados manualmente en la UI.

