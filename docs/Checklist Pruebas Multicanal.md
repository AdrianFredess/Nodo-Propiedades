# Checklist para pruebas - WhatsApp, Messenger, Telegram

## Antes de probar

- [ ] Ollama corriendo con modelo `llama3.2`
- [ ] Credencial de Ollama configurada en n8n
- [ ] Credencial de Google Sheets con acceso al documento
- [ ] WF-02: nodo AI Agent con Ollama Chat Model conectado

## Placeholders a configurar

| Placeholder | Dónde se usa |
|-------------|--------------|
| `__SET_META_PHONE_NUMBER_ID__` | WhatsApp |
| `__SET_META_ACCESS_TOKEN__` | WhatsApp, Messenger |
| `__SET_META_VERIFY_TOKEN__` | WhatsApp, Messenger |
| `__SET_META_PAGE_ID__` | Messenger (referencia) |
| `__SET_TELEGRAM_BOT_TOKEN__` | Telegram |

## Orden de pruebas

### 1. WhatsApp (WF-09B)
1. Activar WF-09B
2. Enviar mensaje al número de WhatsApp
3. Verificar respuesta automática

### 2. Messenger (WF-12)
1. Importar WF-12
2. Reemplazar placeholders
3. Configurar webhook en Meta (URL: `https://tu-n8n/messenger`)
4. Activar WF-12
5. Enviar mensaje a la Página de Facebook
6. Verificar respuesta

### 3. Telegram (WF-13)
1. Importar WF-13
2. Reemplazar `__SET_TELEGRAM_BOT_TOKEN__`
3. Configurar webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://tu-n8n/telegram-bot`
4. Activar WF-13
5. Enviar mensaje al bot
6. Verificar respuesta

### 4. Curiosos
- Enviar mensaje vago: "Hola, que propiedades tienen?"
- Verificar que responde con calidez y ofrece opciones (no descarta)

## Verificación de referencias

```powershell
node scripts/_diagnosticar_workflow_ids.js
node scripts/_verificar_referencias.js
```
