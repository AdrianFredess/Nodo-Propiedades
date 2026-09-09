# Esquema n8n — Nodo Propiedades

Mapa de workflows y flujo común por canal. Actualizado 2026-09-08.

## Flujos principales (mantener activos)

| Nombre | Rol |
|--------|-----|
| **Bot Telegram Inmobiliaria** | Canal Telegram productivo (`@nodoprop_bot`) — canvas en **7 zonas** con sticky notes |
| **SIMPLE-02 WhatsApp Bot** | WhatsApp Cloud API (Meta) — mismo mapa conceptual |
| **SIMPLE-03 Messenger Bot** | Messenger |
| **SIMPLE-04 Seguimiento Automatico** | Follow-up tibios (cron) |
| **PANEL-01 API Leads** | API del panel comercial (leads + payload) |
| **PANEL-02 Envio Masivo Telegram** | Broadcast desde panel |
| **PANEL-03 Stock Update** | Actualización stock desde panel |
| **PANEL-04 Realtime Emit** | Eventos WS al front |
| **PANEL-05 Acciones Lead** | Acciones manuales (seguimiento, etc.) |
| **PANEL-06 Panel Assistant** | Asistente del panel |
| **CITA-01 Formulario Visita** | Form de agenda / visita |

## Canvas (mapa conceptual TG / WA)

Leer de **izquierda a derecha**:

1. **Entrada** — trigger / webhook → normalizar / audio  
2. **Contexto** — stock, historial, políticas, aprendizaje  
3. **IA** — prompt → Groq (o skip si bot pausado) → parsear  
4. **Guardar + Panel** — Sheets, realtime, alertas caliente, advisor action  
5. **Respuesta** — texto + fotos/fichas + cierre  
6. **Rescate 429** (TG) — wait + reenvío ficha/link  
7. **Revisión** — `Conversaciones_Revision`

Scripts de canvas: `node scripts/beautify-all-canvases.js --deploy` (todos los activos, más aire entre nodos).

## Obsoletos / legacy

| Nombre | Acción |
|--------|--------|
| **SIMPLE-01 Telegram Bot** | Legacy; el canal vivo es *Bot Telegram Inmobiliaria*. Desactivar si sigue activo. |
| Workflows WAHA / Evolution / `_TMP *` | No deben existir en la lista; borrar si reaparecen. |

## Pipeline por mensaje (TG / WA / MS)

```
trigger (Telegram / Meta webhook)
  → normalizar (chat_id, texto, audio)
  → leer lead Sheets (Leads_Bot) + historial + stock
  → armar prompt (intent-classifier + humanize + aprendizaje)
  → Groq
  → parsear respuesta (fichas, burbujas, temperatura)
  → append/update Sheets (temperature, historial, handoff…)
  → enviar mensaje(s) al canal
  → rama temperatura: tibio/caliente → notif / bot_paused / emit realtime
  → si falla/pausa → Emit Advisor Action → banner panel (1 clic)
```

### Temperatura

- Score en cada turno: `scripts/snippets/lead-temperatura.js` → `frio|tibio|caliente`.
- Columna Sheets: `temperature` (también se acepta `temperatura`).
- Panel kanban: columnas **Frío / Tibio / Caliente**.
- Detalle: `docs/validacion/temperatura-leads.md`.

### Tono

- Snippets: `humanize-voz.js`, `tg-construir-prompt.js`, `wa-armar-prompt.js`.
- Deploy: `node scripts/patch-advisor-learning.js --deploy` + `node scripts/patch-meta-whatsapp.js --deploy`.

## Cómo probar en Telegram

1. Arrancar stack (`ARRANQUE.bat` o docker compose + ngrok + webhook).
2. Mensaje nuevo: `hola` → respuesta corta.
3. Presupuesto + zona → panel **Tibio**.
4. Crédito + urgencia + zona/tipo → **Caliente** + pausa bot.
5. Abrí el canvas en n8n: sticky notes **NOTE · 1…7** como mapa.
