# Transcripciones live — Derivación A/B/C (evidencia real n8n)

- Fecha: 2026-09-18T13:38:38.481Z
- Método: mismo que criterio 5 — POST webhook Telegram → workflow `8JoSfkcn3pE1f0av` (Bot Telegram Inmobiliaria) en n8n local
- chat_id prueba: `999888801`
- Redeploy previo: OK (`patch-advisor-learning.js --deploy`)

## Respuesta corta a Claude

**Antes de hoy no se habían corrido las 3 pruebas en vivo.** Ahora sí se corrieron contra el sistema real (webhook → n8n → Parsear + nodos Telegram).

Hallazgo crítico B/C: el nodo **Telegram Alerta Owner SÍ se ejecutó**, pero Telegram API respondió **404** (token/chat_id owner con placeholder o inválido en el workflow desplegado). El **texto exacto que se intentó enviar** está en `aviso_vendedor_texto` (contexto armado). No hay entrega exitosa al Telegram del vendedor hasta arreglar `__SET_OWNER_TELEGRAM_CHAT_ID__` / bot token en ese nodo.

---

## Categoría A — `que es una seña`

- exec_id: **13325**
- startedAt: **2026-09-18T13:36:55.272Z**
- stoppedAt: **2026-09-18T13:37:05.429Z**
- derivacion_categoria: **A** / motivo: auto
- bot_paused: **no**
- aviso_vendedor flag: **false**
- IF Temperatura Caliente: rama false (no corre Alerta Owner) — **correcto**

### Cliente → Bot

**[2026-09-18T13:36:55.272Z] Cliente:** que es una seña

**[2026-09-18T13:37:05.429Z] Bot:** Una seña es el pago inicial que se entrega al vendedor para reservar la operacion y demostrar tu intencion de comprar. Se descuenta del precio total y suele firmarse con una promesa de compra, quedando el resto para liquidarse al cerrar la escritura. Te sirve para alguna propiedad en particular?

### Aviso al vendedor

**No se disparó** (sin alerta). Correcto para categoría A.

---

## Categoría B — `quiero agendar visita`

- exec_id: **13326**
- startedAt: **2026-09-18T13:37:16.537Z**
- stoppedAt: **2026-09-18T13:37:49.691Z**
- derivacion_categoria: **B** / motivo: **visita**
- bot_paused: **si** (handoff visita existente)
- aviso_vendedor flag: **true**
- IF Temperatura Caliente: rama true → **Telegram Alerta Owner ejecutó** → API **404 Not Found**

### Cliente → Bot

**[2026-09-18T13:37:16.537Z] Cliente:** quiero agendar visita

**[2026-09-18T13:37:49.691Z] Bot:** Dale, coordinamos. Link: https://deranged-defile-comrade.ngrok-free.dev/webhook/cita-form?chat_id=999888801&nombre=Validacion&canal=telegram Ya le aviso al asesor de Nodo y te confirma el dia por aca

### Texto exacto preparado para el vendedor (`aviso_vendedor_texto` — body que el nodo intentó mandar)

```
AVISO NODO — AVISO B
Cliente: Validacion
Canal: telegram
Motivo: visita
Zona: —
Presupuesto: —
Operacion: —
Urgencia: —
Resumen: quiero agendar visita
Panel: http://localhost:5173/leads/telegram%3A999888801
```

**Entrega real a Telegram del vendedor:** FALLÓ (HTTP 404 del Bot API). No hay mensaje recibido en el celu del vendedor en esta corrida.

---

## Categoría C — `quiero hablar con una persona`

- exec_id: **13327**
- startedAt: **2026-09-18T13:38:00.167Z**
- stoppedAt: **2026-09-18T13:38:29.415Z**
- derivacion_categoria: **C** / motivo: **pide_humano**
- bot_paused: **si**
- aviso_vendedor flag: **true**
- IF → Alerta Owner → **404** igual que B

### Cliente → Bot

**[2026-09-18T13:38:00.167Z] Cliente:** quiero hablar con una persona

**[2026-09-18T13:38:29.415Z] Bot:** con Adrian, en un momento te escribe

(Nota: el template esperado era `Te paso con Adrian, en un momento te escribe.` — salió truncado/alterado en post-proceso; bug aparte.)

### Texto exacto preparado para el vendedor

```
AVISO NODO — DERIVACION C
Cliente: Validacion
Canal: telegram
Motivo: pide_humano
Zona: —
Presupuesto: —
Operacion: —
Urgencia: —
Resumen: quiero hablar con una persona
Panel: http://localhost:5173/leads/telegram%3A999888801
```

**Entrega real a Telegram del vendedor:** FALLÓ (HTTP 404).

---

## Lectura para Claude

| Caso | Bot responde | Alerta armada con contexto | Llegó al TG del vendedor |
|------|--------------|----------------------------|---------------------------|
| A | Sí, explica seña | No (flag false) | No (correcto) |
| B | Sí, agenda + link | Sí (motivo visita, panel link; zona/presu vacíos en esta charla corta) | **No — 404 API** |
| C | Sí, corta (texto imperfecto) | Sí (motivo pide_humano + panel) | **No — 404 API** |

Siguiente fix operativo: sustituir placeholders reales de `Telegram Alerta Owner` (`__SET_TELEGRAM_BOT_TOKEN__` / `__SET_OWNER_TELEGRAM_CHAT_ID__`) en el workflow desplegado y re-probar B/C hasta ver el mensaje en el Telegram del vendedor.
