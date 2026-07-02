# Setup Messenger y Telegram - Guía Completa

## Resumen

El sistema ahora responde en **WhatsApp**, **Messenger** y **Telegram**. Los leads de Marketplace que contacten por Messenger o los que escriban al bot de Telegram pasan por el mismo Core (WF-02) y reciben respuestas automáticas.

---

## 1. Messenger (Facebook / Marketplace)

### Requisitos
- Página de Facebook creada
- App de Meta con productos **Messenger** y **Páginas** habilitados
- Mismo Access Token que WhatsApp (o Page Access Token)

### Configuración en Meta
1. En [developers.facebook.com](https://developers.facebook.com), abre tu app
2. Agrega producto **Messenger** si no está
3. En Messenger → Configuración → Webhooks:
   - **URL de devolución**: `https://TU-DOMINIO/messenger` (Meta usa la misma URL para GET verificación y POST eventos)
   - **Token de verificación**: el mismo que usas para WhatsApp
   - Suscríbete a: **messages**

4. Conecta la Página a la app (Messenger → Configuración → Páginas)

### Webhooks en n8n
- **GET** `/messenger` → Verificación de Meta
- **POST** `/messenger` → Mensajes entrantes

**Importante:** Meta pide **una sola URL** de callback. En n8n cada nodo Webhook puede tener una URL de producción distinta (incluye un ID interno). Revisá en cada nodo la URL que muestra n8n: si Meta solo te deja pegar una URL, tenés que usar la que corresponda al flujo de verificación **y** asegurarte de que los eventos POST lleguen al mismo host/path que configuraste, o poner un proxy ligero que enrute GET vs POST. WhatsApp (WF-09B) usa el mismo patrón con dos nodos; muchos usuarios registran en Meta la URL del webhook de **POST** y la verificación inicial la hacen copiando la URL correcta del nodo GET — verificá en tu instancia qué URL genera cada uno.

### Placeholders
- `__SET_META_VERIFY_TOKEN__` – mismo que WhatsApp
- `__SET_META_ACCESS_TOKEN__` – Page Access Token (puede ser el mismo)
- `__SET_META_PAGE_ID__` – ID de la Página (para referencia)

---

## 2. Telegram

### Requisitos
- Bot creado con [@BotFather](https://t.me/BotFather)
- Token del bot (ej. `123456789:ABCdefGHI...`)

### Configuración del webhook
1. Con n8n corriendo y el workflow WF-13 activo, obtén la URL del webhook
2. Configura el webhook en Telegram:
   ```
   https://api.telegram.org/bot<TU_TOKEN>/setWebhook?url=https://TU-DOMINIO/telegram-bot
   ```

### Placeholders
- `__SET_TELEGRAM_BOT_TOKEN__` – Token del bot de Telegram

---

## 3. Flujo de datos

Todos los canales normalizan al mismo formato antes de llamar a WF-02:

| Campo | WhatsApp | Messenger | Telegram |
|-------|----------|-----------|----------|
| source | whatsapp | messenger | telegram |
| channel_reply_target | phone | PSID | chat_id |
| message | text | text | text |
| lead_name | contact.profile.name | - | first_name + last_name |

---

## 4. Orden de importación y activación

1. Importar workflows: WF-02, WF-12, WF-13
2. Ejecutar `scripts/Reemplazar Placeholders.ps1` con todos los valores
3. Ejecutar `scripts/_actualizar_ids_importados.js` (reemplaza IDs en la base)
4. Activar WF-12 (Messenger) y WF-13 (Telegram)
5. Configurar webhooks en Meta y Telegram

---

## 5. Pruebas rápidas

### Messenger
- Envía un mensaje a tu Página de Facebook
- O publica en Marketplace y haz "Contactar" por Messenger

### Telegram
- Busca tu bot por username
- Envía `/start` o cualquier mensaje

En ambos casos el Core (WF-02) procesa el lead y responde por el mismo canal.
