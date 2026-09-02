# Messenger (Meta) — Guía paso a paso

Guía para activar **SIMPLE-03 Messenger Bot** con el mismo flujo Matías que WhatsApp/Telegram (Groq, Sheets `Leads_Bot`, fotos, visitas, WebSocket al panel).

> **Estado del repo:** el workflow `SIMPLE-03 Messenger Bot.json` se parchea con `scripts/patch-messenger-matias.js` + `scripts/patch-channel-emit.js`. Requiere configuración manual en Meta (Página + webhook).

---

## Checklist rápido

- [ ] Página de Facebook creada y vinculada a la app Meta
- [ ] Producto **Messenger** habilitado en developers.facebook.com
- [ ] **Page Access Token** con permisos `pages_messaging`, `pages_manage_metadata`
- [ ] Mismo `VERIFY_TOKEN` y `ACCESS_TOKEN` que WhatsApp (o token de página dedicado)
- [ ] Webhook `meta-messenger` en n8n accesible por HTTPS
- [ ] Suscripción a eventos `messages`, `messaging_postbacks` (opcional)
- [ ] Workflow SIMPLE-03 activo en n8n
- [ ] PANEL-04 Realtime Emit activo + `ws-bridge` en `:3099`
- [ ] Mensaje de prueba desde Messenger de la Página

---

## 1. Meta — App y Página

1. [developers.facebook.com](https://developers.facebook.com) → tu app de negocio.
2. **Agregar producto → Messenger**.
3. En **Messenger → Configuración → Token de acceso**:
   - Conectá la **Página** de Nodo Propiedades.
   - Generá **Page Access Token** → guardalo como `META_ACCESS_TOKEN` (o token de página separado).
4. Anotá el **Page ID** (`META_PAGE_ID`) — útil para diagnóstico.

**Permisos típicos:**
- `pages_messaging`
- `pages_manage_metadata`
- `pages_read_engagement` (opcional, analytics)

---

## 2. Webhook en Meta

En **Messenger → Configuración → Webhooks**:

| Campo | Valor |
|-------|-------|
| URL de devolución | `https://TU-DOMINIO/webhook/meta-messenger` (URL de producción del nodo n8n) |
| Token de verificación | Mismo `META_VERIFY_TOKEN` del `.env` |
| Suscripciones | `messages` |

**Nota n8n:** SIMPLE-03 tiene dos nodos webhook en el mismo path `meta-messenger`:
- **GET** → verificación (`hub.challenge`)
- **POST** → mensajes entrantes

Copiá la URL de producción que muestra n8n en el nodo **Webhook Messenger** (POST).

---

## 3. Variables de entorno

En `.env` (raíz o n8n):

```env
META_GRAPH_VERSION=v21.0
META_ACCESS_TOKEN=tu_page_access_token
META_VERIFY_TOKEN=tu_token_secreto
META_PAGE_ID=tu_page_id
WEBHOOK_URL=https://tu-dominio-o-ngrok
```

Placeholders en el workflow (`__SET_*__`) se reemplazan al importar o con `scripts/Reemplazar Placeholders.ps1`.

---

## 4. Aplicar parches en el repo

```bash
node scripts/patch-messenger-matias.js
node scripts/patch-channel-emit.js
```

Con n8n local activo:

```bash
node scripts/patch-messenger-matias.js --deploy
node scripts/patch-channel-emit.js --deploy
```

Activar también:
- **PANEL-04 Realtime Emit** (reenvía a `ws-bridge`)
- **PANEL-01 API Leads** (lectura del panel)

---

## 5. Outbound — Graph API Messenger

El bot responde vía:

```
POST https://graph.facebook.com/{version}/me/messages
Authorization: Bearer {PAGE_ACCESS_TOKEN}
```

Cuerpo texto:

```json
{
  "recipient": { "id": "PSID" },
  "messaging_type": "RESPONSE",
  "message": { "text": "Hola, soy Matías..." }
}
```

Imágenes (fichas de propiedades): `message.attachment.type = "image"` con URL pública. Messenger no admite caption en la imagen; el bot envía el texto de la ficha antes de la foto.

---

## 6. Paridad con Telegram / WhatsApp

| Capacidad | Telegram | WhatsApp | Messenger |
|-----------|----------|----------|-----------|
| Bot Matías (Groq) | ✅ | ✅ | ✅ (tras parche) |
| Leads en `Leads_Bot` | ✅ | ✅ | ✅ (tras parche) |
| Fotos de propiedades | ✅ | ✅ | ✅ |
| Solicitud visita (email) | ✅ | ✅ | ✅ |
| WebSocket panel | ✅ | ✅ (tras parche emit) | ✅ (tras parche emit) |
| Marketplace auto | — | — | Manual (contactar por Messenger) |

**Limitaciones Messenger:**
- Solo usuarios que iniciaron chat con la Página (ventana 24 h para mensajes promocionales).
- Marketplace envía el lead a Messenger de la Página; el bot responde igual que un DM.
- Adjuntos de usuario: se normalizan como `[foto]` / `[adjunto]` (sin visión IA por ahora).

---

## 7. Prueba rápida

1. Abrí Messenger y escribí a tu Página de Facebook.
2. En n8n → Executions de SIMPLE-03: debe aparecer el webhook.
3. En el panel CRM (`front`): el chat debe aparecer en tiempo real (ícono WS verde).
4. Pedí "depto en Godoy Cruz hasta 80 mil USD" → debe responder Matías con opciones/fotos.

---

## 8. Troubleshooting

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| Meta no verifica webhook | URL incorrecta o workflow inactivo | Activar SIMPLE-03, copiar URL POST |
| Bot no responde | Token de página inválido | Regenerar Page Access Token |
| Panel no actualiza | PANEL-04 o ws-bridge caído | `curl http://localhost:3099/health` |
| Leads no persisten | OAuth Sheets vencido | Reconectar credencial Google en n8n |
| `(#10) Application does not have permission` | Permisos Messenger faltantes | Revisar `pages_messaging` en la app |

---

*Ver también: `docs/Setup Messenger y Telegram.md`, `docs/WHATSAPP-CLOUD-META.md`, `workflows/README.md`*
