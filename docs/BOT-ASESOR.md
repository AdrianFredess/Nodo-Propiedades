# Bot asesor profesional (Matías)

## Persona

- **Matías**, asesor de Nodo Propiedades (Mendoza).
- Tono: amigable pero **serio y responsable**. Sin apodos, sin "che", sin revelar que es automatizado.
- Respuestas **cortas y precisas**; usa todo el historial del chat para no repetir ni ignorar datos del cliente.

## Propiedades con fotos

- Cada ítem del stock (`MZA-001` … `MZA-030`) tiene **4 fotos** (Unsplash, coherentes por tipo) en `data/propiedad-media.json`.
- Regenerar: `node scripts/generate-propiedad-media.js`
- El bot, al recomendar opciones, incluye bloque `###MOSTRAR_PROPIEDADES###` → Telegram envía las fotos + link a ficha del panel (`/catalogo/{id}`).

## Visitas

1. Cliente pide ver / agendar → link `cita-form` (turnos libres).
2. Si confirma visita con asesor → mensaje fijo + email a `NOTIFY_EMAIL` (FormSubmit).

## Aplicar en n8n

```bash
node scripts/generate-propiedad-media.js
node scripts/patch-asesor-profesional.js
```

Parchea **Bot Telegram** (prompt, fotos, email visita) y **SIMPLE-02 WhatsApp** (stock, fotos, email visita). Para outbound WhatsApp con Meta Cloud API, corré después:

```bash
node scripts/patch-meta-whatsapp.js --deploy
```

## WhatsApp (Meta Cloud API)

1. Chip prepago dedicado (no uses tu número personal si podés evitarlo).
2. Completá `META_*` en `.env` — ver `docs/WHATSAPP-CLOUD-META.md`.
3. `node scripts/patch-meta-whatsapp.js --deploy` (webhook `meta-whatsapp`, envío Graph API).
4. Al escribir al número de negocio, Matías responde con texto + fotos.

Si faltan credenciales Meta, n8n sigue funcionando; solo fallará el envío al cliente (el resto del CRM no se rompe).

## Catálogo público (links desde el celular)

Por defecto los links de ficha apuntan a `localhost` (sirven en la PC, no en el teléfono).

1. Reservá un **segundo dominio** en ngrok (o usá el mismo equipo con túnel aparte).
2. En `.env`: `NGROK_CATALOG_DOMAIN=tu-dominio.ngrok-free.dev`
3. `scripts\ngrok-catalogo.bat` (con el front en `:5173`)
4. Regenerá media y parcheá de nuevo:

```bash
set CATALOG_PUBLIC_BASE_URL=https://tu-dominio.ngrok-free.dev/catalogo
node scripts/generate-propiedad-media.js
node scripts/patch-asesor-profesional.js
```

## Variables opcionales

- `CATALOG_PUBLIC_BASE_URL` — URL pública del catálogo (para links en el bot). Default: `http://localhost:5173/catalogo`
- `NOTIFY_EMAIL` — mail de alertas de visita (default: cuenta del proyecto)
