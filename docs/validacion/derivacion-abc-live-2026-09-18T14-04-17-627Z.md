# Transcripciones live — Derivación A/B/C

- Fecha: 2026-09-18T14:04:17.627Z
- chat_id: 999888801
- workflow: 8JoSfkcn3pE1f0av

## Categoría A — `que es una seña`

- exec_id: 13338
- startedAt: 2026-09-18T14:02:34.793Z
- stoppedAt: 2026-09-18T14:02:42.339Z
- derivacion_categoria (parsear): A
- derivacion_motivo: auto
- bot_paused: no
- aviso_vendedor flag: false

### Cliente → Bot (Telegram)

**[2026-09-18T14:02:34.793Z] Cliente:** que es una seña

**[2026-09-18T14:02:42.339Z] Bot:** Ahi van estas

### Aviso al vendedor (Telegram Owner)

_Sin aviso al vendedor en esta ejecución._

## Categoría B — `quiero agendar visita`

- exec_id: 13339
- startedAt: 2026-09-18T14:02:53.142Z
- stoppedAt: 2026-09-18T14:03:25.057Z
- derivacion_categoria (parsear): B
- derivacion_motivo: visita
- bot_paused: si
- aviso_vendedor flag: true

### Cliente → Bot (Telegram)

**[2026-09-18T14:02:53.142Z] Cliente:** quiero agendar visita

**[2026-09-18T14:03:25.057Z] Bot:** Dale, coordinamos. Link: https://deranged-defile-comrade.ngrok-free.dev/webhook/cita-form?chat_id=999888801&nombre=Validacion&canal=telegram El asesor te confirma el dia por aca

### Aviso al vendedor (Telegram Owner)

**ENTREGA CONFIRMADA** (message_id: 323)

```
AVISO NODO - AVISO B
Cliente: Validacion
Canal: telegram
Motivo: visita
Zona: -
Presupuesto: -
Operacion: -
Urgencia: -
Resumen: quiero agendar visita
Panel: http://localhost:5173/leads/telegram%3A999888801
```

## Categoría C — `quiero hablar con una persona`

- exec_id: 13340
- startedAt: 2026-09-18T14:03:36.728Z
- stoppedAt: 2026-09-18T14:04:07.279Z
- derivacion_categoria (parsear): C
- derivacion_motivo: pide_humano
- bot_paused: si
- aviso_vendedor flag: true

### Cliente → Bot (Telegram)

**[2026-09-18T14:03:36.728Z] Cliente:** quiero hablar con una persona

**[2026-09-18T14:04:07.279Z] Bot:** Te paso con Adrian, en un momento te escribe

### Aviso al vendedor (Telegram Owner)

**ENTREGA CONFIRMADA** (message_id: 324)

```
AVISO NODO - DERIVACION C
Cliente: Validacion
Canal: telegram
Motivo: pide humano
Zona: -
Presupuesto: -
Operacion: -
Urgencia: -
Resumen: quiero hablar con una persona
Panel: http://localhost:5173/leads/telegram%3A999888801
```
