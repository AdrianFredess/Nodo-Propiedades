# Validación — Temperatura dinámica (frío / tibio / caliente)

## Cómo funciona el score

En cada mensaje se recalcula con `scripts/snippets/lead-temperatura.js`:

| Señal | Fuerte si… |
|-------|------------|
| Financiación | `credito_preaprobado` o `fondos_propios` |
| Urgencia | `inmediato` o `1-3m` |
| Presupuesto | horquilla numérica detectada |
| Zona | barrio/zona concreta (no “Mendoza” amplio) |
| Tipo + decisor | tipo claro; no bloquea si aún no dijo ser decisor |

- **Caliente** = financiación clara + urgencia &lt;3m + (zona concreta **o** tipo concreto). Zona exacta es bonus, no veto.
- **Tibio** = ≥1 señal fuerte sin llegar a caliente.
- **Frío** = sin señales fuertes.
- **No clasifica** tibio/caliente en el primer “hola / qué tenés” genérico (hace falta ≥1–2 intercambios con intención).

Columna de panel: `temperature` / `temperatura` = `frio|tibio|caliente`.  
El kanban del front muestra esas 3 columnas (ya **no** usa `lead_completo` para meter todo en “Conversando”).  
Columnas técnicas opcionales en Sheets: `bot_paused`, `handoff`, `senales_json`.

## Cómo SIMPLE-04 recibe tibios

SIMPLE-04 **no se tocó**. Filtra `Leads_Bot` por `estado_seguimiento` ∈ `{ninguno, enviado_1}` y ≥20 min sin mensaje.

- Lead **tibio** → `estado_seguimiento = ninguno` → entra al seguimiento.
- Lead **caliente** → `estado_seguimiento = respondido` + `bot_paused = si` → SIMPLE-04 lo saltea; el bot deja de responder IA.

## Checklist de pruebas

### 1. Caliente clásico (financiación + urgencia + zona)

1. Chat de prueba WA o TG (lead nuevo).
2. Msg1: “Hola, busco depto”
3. Msg2: “Tengo crédito preaprobado, necesito mudarme este mes en Godoy Cruz”
4. Esperado:
   - `temperature = caliente`
   - Cierre: “Perfecto. Ya tengo lo necesario, un asesor te contacta en breve.”
   - Email + Telegram owner con las 5 señales
   - `bot_paused = si`, `estado_seguimiento = respondido`
5. Msg3 cualquiera → **sin** respuesta IA.

### 2. Caliente sin zona (financiación + urgencia + tipo)

1. “Busco casa, pago de contado, lo necesito ya”
2. Esperado: `caliente` aunque no diga barrio (tipo concreto alcanza).

### 3. Tibio (interés real, sin financiación/plazo)

1. Tras 2+ mensajes: “Me interesa un depto en Maipú hasta 90 mil”
2. Esperado:
   - `temperature = tibio`
   - 1–2 fichas si hay stock
   - Cierre: comercial corto variable (“Cual te copa mas de estas?” / “Si queres te armo visita…”)
   - PROHIBIDO: “Te dejo estas opciones… en unos días te escribo…”
   - `estado_seguimiento = ninguno`
   - **Sin** notif urgente
   - Tras 20+ min sin respuesta, SIMPLE-04 puede escribirle

### 4. Frío / primer “hola qué tenés”

1. Primer mensaje: “hola qué tenés”
2. Esperado:
   - Responde liviano / puede mostrar stock curioso
   - `temperature` queda `frio` (no corta, no notifica, no pausa bot)
   - No marca tibio/caliente solo por ese saludo

## Deploy

```bash
node scripts/patch-advisor-learning.js --deploy
node scripts/patch-meta-whatsapp.js --deploy
```

Si Sheets aún no tiene columnas `bot_paused` / `handoff` / `senales_json`, agregalas en el header de `Leads_Bot` (n8n appendOrUpdate las escribe si existen).
