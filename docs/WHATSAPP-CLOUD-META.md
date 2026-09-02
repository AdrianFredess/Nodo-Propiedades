# WhatsApp Cloud API (Meta) — Guía paso a paso

Guía práctica para conectar **Meta WhatsApp Cloud API** al proyecto Nodo Propiedades (n8n + SIMPLE-02 + panel).

> **Estado actual del repo:** WhatsApp usa **Meta Cloud API** en SIMPLE-02, SIMPLE-04 (seguimiento), PANEL-05 (envío manual). Esta guía documenta la configuración y los parches (`scripts/patch-meta-whatsapp.js`, etc.).

---

## Checklist rápido

- [ ] Cuenta Meta Business verificada
- [ ] App creada en developers.facebook.com con producto WhatsApp
- [ ] Número de teléfono conectado (nuevo o migrado)
- [ ] `Phone Number ID` + `WhatsApp Business Account ID` anotados
- [ ] Access Token **permanente** (System User)
- [ ] Verify Token definido por vos
- [ ] n8n accesible por HTTPS (ngrok dev / dominio prod)
- [ ] Webhook registrado en Meta → verificación GET OK
- [ ] Suscripción a campo `messages`
- [ ] Mensaje de prueba enviado (curl o Graph API Explorer)
- [ ] Workflow n8n adaptado (inbound Meta + outbound Graph API)
- [ ] Variables en `.env` completadas
- [ ] WAHA apagado (legacy eliminado del repo; no usar en paralelo)

---

## 1. Requisitos previos

### 1.1 Cuenta Meta Business

1. Entrá a [business.facebook.com](https://business.facebook.com).
2. Creá o usá una **Meta Business Account** (no basta con perfil personal).
3. Completá datos del negocio (nombre, dirección, sitio web si tenés).

### 1.2 Verificación del negocio

Meta puede pedir verificación antes de escalar límites o usar número real en producción:

- Documento legal del negocio (CUIT, estatuto, factura de servicio, etc.).
- Sitio web o presencia online coherente con el rubro inmobiliario.

**Links oficiales:**
- [Verificación del negocio](https://www.facebook.com/business/help/2058515294227817)
- [Requisitos WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)

### 1.3 Número de teléfono

Tenés dos caminos:

| Opción | Cuándo usarla | Notas |
|--------|---------------|-------|
| **Número nuevo** | Primera vez, sin WhatsApp activo en ese chip | Meta da un número de prueba; para producción agregás el tuyo |
| **Migrar número existente** | Ya tenés WhatsApp Business en ese número | El número deja de funcionar en la app móvil; es irreversible |

**Recomendación para Nodo Propiedades:** chip prepago **dedicado** (no tu WhatsApp personal). Mismo criterio que con WAHA (`docs/BOT-ASESOR.md`).

**Argentina:** formato E.164 sin `+` en la API → `54911XXXXXXXX` (54 + 9 + área sin 0 + número).

---

## 2. Crear app y configurar WhatsApp

### 2.1 Crear la app

1. [developers.facebook.com](https://developers.facebook.com) → **Mis apps** → **Crear app**.
2. Tipo: **Otro** → **Empresa** (Business).
3. Nombre: ej. `Nodo Propiedades WhatsApp`.
4. Business Account: seleccioná la tuya.

### 2.2 Agregar producto WhatsApp

1. En el panel de la app → **Agregar producto** → **WhatsApp** → **Configurar**.
2. En **WhatsApp → API Setup** vas a ver:
   - **Phone number ID** → guardalo como `META_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** → guardalo (útil para webhooks y Business Manager)
   - **Temporary access token** → solo para pruebas iniciales (expira en ~24 h)

### 2.3 Número de prueba vs producción

- **Modo desarrollo:** podés enviar mensajes solo a números agregados como "test recipients" en API Setup.
- **Modo producción:** app en **Live**, negocio verificado, número real registrado.

**Link:** [Phone numbers — Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers)

---

## 3. Obtener credenciales permanentes

### 3.1 Phone Number ID y WABA ID

En **WhatsApp → API Setup** de tu app:

```
Phone number ID:     123456789012345
WhatsApp Business Account ID: 987654321098765
```

### 3.2 Access Token permanente (System User)

El token temporal de la consola **no sirve para producción**. Generá uno permanente:

1. [business.facebook.com](https://business.facebook.com) → **Configuración del negocio** (⚙).
2. **Usuarios → Usuarios del sistema** → **Agregar**.
3. Nombre: `nodo-n8n-api`. Rol: **Admin** (o permisos mínimos sobre WhatsApp).
4. **Agregar activos** → asigná:
   - La app de WhatsApp
   - La cuenta de WhatsApp Business (WABA)
   - El número de teléfono
5. **Generar token nuevo** → seleccioná la app → permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. Copiá el token → `META_ACCESS_TOKEN` (no lo commitees).

**Link:** [Access tokens — System User](https://developers.facebook.com/docs/whatsapp/business-management-api/get-started#system-user-access-tokens)

### 3.3 Verify Token (lo definís vos)

String arbitrario que Meta usará para verificar el webhook. Ejemplo:

```bash
openssl rand -hex 16
# → a1b2c3d4e5f6...
```

Guardalo como `META_VERIFY_TOKEN`. Debe coincidir **exactamente** en Meta y en n8n.

### 3.4 App Secret (opcional pero recomendado)

En **Configuración de la app → Básica** → **Secreto de la app** → `META_APP_SECRET`.

Sirve para validar la firma `X-Hub-Signature-256` en webhooks POST (seguridad extra).

---

## 4. Webhook: URL, verificación y suscripción

### 4.1 URL pública de n8n

Meta exige **HTTPS**. El callback apunta al webhook de n8n:

| Entorno | URL base | Webhook WhatsApp (SIMPLE-02 adaptado) |
|---------|----------|---------------------------------------|
| **Dev local** | ngrok → `:5678` | `https://TU-DOMINIO.ngrok-free.dev/webhook/meta-whatsapp` |
| **Producción (Render, VPS)** | dominio fijo | `https://n8n.tudominio.com/webhook/meta-whatsapp` |

En `.env`:

```env
N8N_HOST=tu-dominio.ngrok-free.dev   # o dominio prod
N8N_PROTOCOL=https
WEBHOOK_URL=https://tu-dominio.ngrok-free.dev/
```

Reiniciá n8n después de cambiar `WEBHOOK_URL` (`docker compose up -d`).

**Dev con ngrok (este repo):**

```bat
REM Terminal 1: n8n
docker compose up -d

REM Terminal 2: túnel (dominio reservado en ngrok)
ngrok http --domain=TU-DOMINIO.ngrok-free.dev 5678
```

O usá `ARRANQUE.bat` si ya tenés el dominio configurado.

### 4.2 Registrar webhook en Meta

1. App → **WhatsApp → Configuración** (Configuration).
2. **Webhook** → **Editar**.
3. **Callback URL:** `https://TU-DOMINIO/webhook/meta-whatsapp`
4. **Verify token:** el mismo valor que `META_VERIFY_TOKEN`.
5. Clic **Verificar y guardar**.

Meta hace un `GET` con:

```
?hub.mode=subscribe
&hub.verify_token=TU_VERIFY_TOKEN
&hub.challenge=CHALLENGE_ALEATORIO
```

n8n debe responder con el `hub.challenge` en texto plano (HTTP 200).

### 4.3 Patrón en n8n (copiar de SIMPLE-03)

`SIMPLE-03 Messenger Bot.json` ya implementa verificación Meta. Replicá el mismo patrón en WhatsApp:

1. **Webhook GET** — path `meta-whatsapp`, responde `$json.query['hub.challenge']`.
2. **Webhook POST** — mismo path, recibe mensajes.

```
Meta GET  → /webhook/meta-whatsapp → Respond hub.challenge
Meta POST → /webhook/meta-whatsapp → Code Normalizar → resto del flujo
```

### 4.4 Suscribir campos (fields)

En la misma pantalla de webhook, **Manage** → suscribí:

| Campo | Para qué |
|-------|----------|
| `messages` | **Obligatorio** — mensajes entrantes |
| `message_template_status_update` | Estado de plantillas aprobadas |
| `message_deliveries` | Confirmación de entrega (opcional) |
| `message_reads` | Confirmación de lectura (opcional) |

Para Nodo Propiedades alcanza con `messages` para arrancar.

---

## 5. Enviar mensaje de prueba

### 5.1 Agregar destinatario de prueba

En **API Setup**, sección **To**, agregá tu celular en formato internacional (`+54911...`).

### 5.2 curl

```bash
curl -X POST "https://graph.facebook.com/v21.0/TU_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "5491100000000",
    "type": "text",
    "text": {
      "preview_url": false,
      "body": "Hola desde Nodo Propiedades — prueba Cloud API"
    }
  }'
```

Reemplazá:
- `TU_PHONE_NUMBER_ID`
- `TU_ACCESS_TOKEN`
- `5491100000000` (tu número de prueba, sin `+`)

### 5.3 Graph API Explorer

[developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer) → seleccioná tu app → permiso `whatsapp_business_messaging` → POST al mismo endpoint.

### 5.4 Respuesta esperada

```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "5491100000000", "wa_id": "5491100000000" }],
  "messages": [{ "id": "wamid.xxx" }]
}
```

---

## 6. Integración con n8n

### 6.1 Dos formas de enviar

| Método | Pros | Contras |
|--------|------|---------|
| **Nodo WhatsApp Business Cloud** (nativo n8n) | UI amigable, credenciales en n8n | Menos control sobre payload custom |
| **HTTP Request → graph.facebook.com** | Mismo patrón que SIMPLE-03; flexible para fotos/templates | Configuración manual |

Este repo usa **HTTP Request** en SIMPLE-03 y estaba preparado para Meta en SIMPLE-02 (ver `openspec/INTEGRATIONS.md`).

### 6.2 Outbound — Graph API (reemplaza legacy WAHA)

**Antes (legacy WAHA, ya eliminado del repo):**

```
POST http://host.docker.internal:3002/api/sendText
Header: X-Api-Key: __SET_WAHA_API_KEY__
Body: { "session": "nodo", "chatId": "549...@c.us", "text": "..." }
```

**Meta Cloud API** — nodo `HTTP Request - Enviar WhatsApp`:

```
POST https://graph.facebook.com/v21.0/__SET_META_PHONE_NUMBER_ID__/messages
Header: Authorization: Bearer __SET_META_ACCESS_TOKEN__
Header: Content-Type: application/json
Body:
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "={{ $('Code - Procesar IA').item.json.phone }}",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "={{ $('Code - Procesar IA').item.json.respuesta_wa }}"
  }
}
```

> **Importante:** con Meta, `to` es solo dígitos E.164 (`54911...`), **sin** `@c.us`. Ajustá el normalizador inbound.

### 6.3 Inbound — normalizar payload Meta

Reemplazá el Code `Normalizar WhatsApp` (hoy parsea WAHA/Evolution) por lógica similar a Messenger:

```javascript
const body = $input.first().json.body || $input.first().json;

try {
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const msg = value?.messages?.[0];

  if (!msg || msg.type !== 'text') return [];

  const phone = String(msg.from || '');
  const texto = String(msg.text?.body || '').trim();
  if (!phone || !texto) return [];

  const nombre = value.contacts?.[0]?.profile?.name || 'Cliente';

  return [{
    json: {
      canal: 'whatsapp',
      chat_id: phone,                    // Meta usa wa_id numérico
      dedupe_key: 'whatsapp:' + phone,
      lead_name: nombre,
      phone: phone,
      mensaje: texto,
      waba_message_id: msg.id || '',
      fecha: new Date().toISOString(),
    },
  }];
} catch (e) {
  return [];
}
```

Respondé siempre `200 OK` al webhook POST (nodo Respond to Webhook), aunque no proceses el evento — Meta reintenta si falla.

### 6.4 Enviar imágenes (fotos de propiedades)

Matías envía fotos vía `scripts/patch-asesor-profesional.js` (nodos WAHA `sendImage`). Con Meta:

```json
{
  "messaging_product": "whatsapp",
  "to": "5491100000000",
  "type": "image",
  "image": {
    "link": "https://images.unsplash.com/photo-xxx",
    "caption": "MZA-001 — Departamento en Mendoza"
  }
}
```

La URL debe ser **pública HTTPS** (Unsplash funciona). Meta no acepta URLs locales.

### 6.5 Credencial n8n (alternativa al Bearer inline)

Creá credencial **WhatsApp API** o **Header Auth**:
- Name: `Authorization`
- Value: `Bearer TU_TOKEN`

Referenciá la credencial en los nodos HTTP en lugar de pegar el token en el JSON.

---

## 7. Adaptar SIMPLE-02 vs workflow nuevo

### 7.1 Opción A — Adaptar SIMPLE-02 (recomendada para este repo)

Ventaja: conservás Matías, Groq, Sheets, alertas Telegram, fotos, email visitas.

| Paso | Acción |
|------|--------|
| 1 | Duplicá el workflow en n8n → `SIMPLE-02 Meta WhatsApp` |
| 2 | Cambiá webhook path de `evolution-whatsapp` a `meta-whatsapp` |
| 3 | Agregá webhook GET de verificación (copiá de SIMPLE-03) |
| 4 | Reemplazá Code Normalizar por parser Meta (§6.3) |
| 5 | Reemplazá HTTP Enviar WhatsApp: WAHA → Graph API (§6.2) |
| 6 | Reemplazá nodos WAHA Enviar Imagen/Burbuja por HTTP con `type: image` / `type: text` |
| 7 | Reemplazá placeholders `__SET_META_*__` |
| 8 | Desactivá el SIMPLE-02 original (WAHA) |
| 9 | Apagá WAHA: `docker compose -f docker-compose.waha.yml down` |

### 7.2 Opción B — Stack WF-09B (documentado, no incluido en repo)

Los docs `LEER PRIMERO - Meta Produccion Final.md` y `Stack Final Meta Produccion.md` referencian workflows `WF-09B`, `WF-10`, `WF-11` que **no están en `workflows/`** del repo actual. Si los tenés en otra copia o los regenerás, el endpoint sería `/webhook/meta-whatsapp-prod`.

Para Nodo Propiedades hoy, **Opción A es más directa**.

### 7.3 Opción C — Coexistencia WAHA + Meta (no recomendada)

Solo para migración gradual:

- WAHA webhook: `/webhook/evolution-whatsapp`
- Meta webhook: `/webhook/meta-whatsapp`
- **Nunca** los dos activos con el **mismo número** (imposible técnicamente)
- Podés correr ambos con **números distintos** (uno oficial, uno WAHA de prueba)

---

## 8. Variables de entorno

Copiá `.env.example` → `.env` y completá:

```env
# n8n — URL pública (Meta exige HTTPS)
N8N_HOST=tu-dominio.ngrok-free.dev
N8N_PROTOCOL=https
WEBHOOK_URL=https://tu-dominio.ngrok-free.dev/

# Meta WhatsApp Cloud API
META_GRAPH_VERSION=v21.0
META_PHONE_NUMBER_ID=123456789012345
META_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxx
META_VERIFY_TOKEN=tu-string-secreto-verify
META_APP_SECRET=abc123def456

# Asesor (alertas)
ADVISOR_PHONE=+549XXXXXXXXXX

# Catálogo público (links en mensajes del bot)
CATALOG_PUBLIC_BASE_URL=https://tu-dominio-catalogo.ngrok-free.dev/catalogo
CATALOG_SHARE_SECRET=genera-con-openssl-rand-hex-16

# Groq (IA Matías)
GROQ_API_KEY=gsk_...

# Google Sheets
GOOGLE_SHEET_ID=tu-spreadsheet-id
```

**Placeholders en workflows** (reemplazar en n8n o con script):

| Placeholder | Variable .env |
|-------------|---------------|
| `__SET_META_GRAPH_VERSION__` | `META_GRAPH_VERSION` |
| `__SET_META_PHONE_NUMBER_ID__` | `META_PHONE_NUMBER_ID` |
| `__SET_META_ACCESS_TOKEN__` | `META_ACCESS_TOKEN` |
| `__SET_META_VERIFY_TOKEN__` | `META_VERIFY_TOKEN` |
| `__SET_META_APP_SECRET__` | `META_APP_SECRET` |
| `__SET_ADVISOR_PHONE__` | `ADVISOR_PHONE` |

---

## 9. Errores comunes

| Error / síntoma | Causa | Solución |
|-----------------|-------|----------|
| Webhook verification failed | Verify token distinto entre Meta y n8n | Unificá `META_VERIFY_TOKEN` |
| `(#100) Invalid parameter` en `to` | Formato de teléfono incorrecto | E.164 sin `+`: `54911...` |
| `(#131030) Recipient not in allowed list` | App en modo dev | Agregá el número en test recipients o pasá a Live |
| `(#131047) Re-engagement message` | Pasaron +24 h sin mensaje del usuario | Usá **template aprobado**, no texto libre |
| `(#131026) Message undeliverable` | Usuario sin WhatsApp o te bloqueó | Verificá número real |
| `(#190) Invalid OAuth access token` | Token expirado o revocado | Regenerá token permanente (System User) |
| `(#200) Permissions error` | Token sin permisos WhatsApp | Agregá `whatsapp_business_messaging` al System User |
| Número no verificado | Registro incompleto del phone number | Completá verificación en Business Manager |
| Doble respuesta al cliente | WAHA y Meta activos | Desactivá WAHA y workflow viejo |
| Imagen no llega | URL no pública o HTTP | Usá HTTPS público (Unsplash, CDN) |
| n8n no recibe POST | `WEBHOOK_URL` incorrecta o ngrok caído | Verificá túnel y reiniciá n8n |
| 403 en ngrok free | Falta header browser | Meta no usa ngrok browser warning; si probás manual, agregá header |

### Ventana de 24 horas

- **Dentro de 24 h** desde el último mensaje del **cliente**: podés enviar texto libre, imágenes, botones.
- **Fuera de 24 h**: solo **Message Templates** aprobados por Meta.

Ver: `docs/Meta Ventana 24h y Templates.md`

### Políticas

- No spam ni mensajes no solicitados.
- Opt-in implícito: el cliente te escribió primero.
- Templates para reactivación deben estar aprobados y respetar categorías (Marketing, Utility, Authentication).

**Link:** [Políticas de mensajería WhatsApp Business](https://www.whatsapp.com/legal/business-policy)

---

## 10. Desarrollo vs producción

### Desarrollo local

```
┌─────────┐     HTTPS      ┌───────┐     HTTP      ┌─────┐
│  Meta   │ ──────────────→│ ngrok │ ────────────→ │ n8n │ :5678
└─────────┘                └───────┘               └─────┘
```

1. `docker compose up -d` (n8n)
2. `ngrok http --domain=TU-DOMINIO.ngrok-free.dev 5678`
3. `.env` con `WEBHOOK_URL=https://TU-DOMINIO.ngrok-free.dev/`
4. Activá workflow Meta en n8n
5. Registrá webhook en Meta apuntando al dominio ngrok
6. Enviá WhatsApp al número conectado → verificá fila nueva en `Leads_Bot`

**Panel frontend:** otro túnel ngrok para `:5173` (`scripts/ngrok-catalogo.bat`) si querés links de catálogo en el celular.

### Producción (Render / VPS)

| Aspecto | Recomendación |
|---------|---------------|
| n8n | Web service con dominio fijo, `WEBHOOK_URL=https://n8n.tudominio.com/` |
| HTTPS | Obligatorio (Render lo provee) |
| Token | System User permanente, rotación periódica |
| ngrok | No usar en prod |
| WAHA | Apagar — solo Cloud API |
| Ephemeral FS (Render) | Datos n8n en volumen persistente o DB externa |

**Render:** bind `0.0.0.0:$PORT`, filesystem efímero — persistí `database.sqlite` en disco adjunto o Postgres.

---

## 11. Legacy WAHA (eliminado)

WAHA ya no forma parte del repo. Si tenías `./waha-data/` local (gitignored), podés borrarlo. No correr WAHA en paralelo con Meta (doble respuesta).

Parches actuales: `pnpm run patch-meta-all` (SIMPLE-02, PANEL-05, SIMPLE-04, Messenger, emit).

---

## 12. Prueba end-to-end (checklist final)

1. [ ] Token permanente generado y guardado en `.env`
2. [ ] n8n corriendo, `WEBHOOK_URL` correcta
3. [ ] ngrok activo (dev) o dominio prod responde
4. [ ] Workflow `SIMPLE-02 Meta` activo con webhooks GET + POST
5. [ ] Meta → webhook verificado (✓ verde)
6. [ ] Campo `messages` suscripto
7. [ ] Enviás "Hola" desde tu celular al número de negocio
8. [ ] n8n ejecuta workflow (ver Executions)
9. [ ] Fila nueva/actualizada en Google Sheets `Leads_Bot`
10. [ ] Recibís respuesta de Matías en WhatsApp
11. [ ] (Opcional) Pedís propiedades → recibís fotos + links catálogo
12. [ ] Lead caliente → email + alerta Telegram

---

## 13. Links oficiales Meta

| Recurso | URL |
|---------|-----|
| Cloud API — Get Started | https://developers.facebook.com/docs/whatsapp/cloud-api/get-started |
| Send Messages | https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages |
| Webhooks | https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks |
| Phone Numbers | https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers |
| Message Templates | https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates |
| Graph API Reference | https://developers.facebook.com/docs/graph-api/reference |
| Business Manager | https://business.facebook.com |
| Developers Console | https://developers.facebook.com |
| Graph API Explorer | https://developers.facebook.com/tools/explorer |
| Política de mensajería | https://www.whatsapp.com/legal/business-policy |

---

## 14. Documentos relacionados en el repo

| Archivo | Contenido |
|---------|-----------|
| `docs/Meta WhatsApp Cloud API - Setup.md` | Resumen técnico placeholders y payloads |
| `docs/Meta Ventana 24h y Templates.md` | Reglas de templates fuera de ventana |
| `docs/Stack Final Meta Produccion.md` | Stack WF-09B (si tenés esos workflows) |
| `docs/BOT-ASESOR.md` | Persona Matías, fotos, Meta Cloud |
| `docs/ARRANQUE-LOCAL.md` | Docker, ngrok, panel |
| `openspec/INTEGRATIONS.md` | Integraciones Groq, Meta, Telegram |
| `.env.example` | Variables Meta listas para copiar |
| `workflows/SIMPLE-02 WhatsApp Bot.json` | Bot WA (Meta webhook `meta-whatsapp`) |
| `workflows/SIMPLE-04 Seguimiento Automatico.json` | Seguimiento automático (Meta outbound) |
| `workflows/SIMPLE-03 Messenger Bot.json` | Referencia webhook Meta GET/POST |

---

*Última actualización: septiembre 2026 — SIMPLE-02/04/PANEL-05 en Meta Cloud API v21.0.*
