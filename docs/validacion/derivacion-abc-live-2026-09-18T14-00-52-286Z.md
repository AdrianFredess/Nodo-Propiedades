# Transcripciones live — Derivación A/B/C

- Fecha: 2026-09-18T14:00:52.286Z
- chat_id: 999888801
- workflow: 8JoSfkcn3pE1f0av

## Categoría A — `que es una seña`

- exec_id: 13333
- startedAt: 2026-09-18T13:59:08.759Z
- stoppedAt: 2026-09-18T13:59:17.300Z
- derivacion_categoria (parsear): A
- derivacion_motivo: auto
- bot_paused: no
- aviso_vendedor flag: false

### Cliente → Bot (Telegram)

**[2026-09-18T13:59:08.759Z] Cliente:** que es una seña

**[2026-09-18T13:59:17.300Z] Bot:** Te mando estas para que veas

### Aviso al vendedor (Telegram Owner)

_Sin aviso al vendedor en esta ejecución._

## Categoría B — `quiero agendar visita`

- exec_id: 13334
- startedAt: 2026-09-18T13:59:27.528Z
- stoppedAt: 2026-09-18T14:00:01.529Z
- derivacion_categoria (parsear): B
- derivacion_motivo: visita
- bot_paused: si
- aviso_vendedor flag: true

### Cliente → Bot (Telegram)

**[2026-09-18T13:59:27.528Z] Cliente:** quiero agendar visita

**[2026-09-18T14:00:01.529Z] Bot:** Dale, coordinamos. Link: https://deranged-defile-comrade.ngrok-free.dev/webhook/cita-form?chat_id=999888801&nombre=Validacion&canal=telegram El asesor te confirma el dia por aca

### Aviso al vendedor (Telegram Owner)

**ENTREGA CONFIRMADA** (message_id: 321)

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

## Categoría C — `quiero hablar con una persona`

- exec_id: 13335
- startedAt: 2026-09-18T14:00:11.395Z
- stoppedAt: 2026-09-18T14:00:41.600Z
- derivacion_categoria (parsear): C
- derivacion_motivo: pide_humano
- bot_paused: si
- aviso_vendedor flag: true

### Cliente → Bot (Telegram)

**[2026-09-18T14:00:11.395Z] Cliente:** quiero hablar con una persona

**[2026-09-18T14:00:41.600Z] Bot:** Te paso con Adrian, en un momento te escribe

### Aviso al vendedor (Telegram Owner)

**FALLO ENTREGA:**
```
Bad Request: can't parse entities: Can't find end of the entity starting at byte offset 76
```

_Payload que se intentó:_
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
