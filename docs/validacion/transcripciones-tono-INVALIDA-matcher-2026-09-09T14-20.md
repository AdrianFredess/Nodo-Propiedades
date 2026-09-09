# Transcripciones validación tono / 429

- Fecha: 2026-09-09T14:21:01.595Z
- n8n: local 2.12.3 (npx) + ngrok
- Workflow: Bot Telegram Inmobiliaria (8JoSfkcn3pE1f0av)
- chat_id prueba: 999888777

> Fuente: ejecuciones n8n reales (Parsear Respuesta / Telegram Responder). No reconstruido a mano.

## Criterio 1 — Saludo

id: `criterio-1-saludo`

### Turno

**Cliente:** hola

**Bot (Parsear.respuesta_bot):** Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?

- exec_id: 12918
- status: success
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- telegram_enviado: Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?
- latencia_ms: 1618

## Criterio 2 — Pedido de fichas

id: `criterio-2-fichas`

### Turno

**Cliente:** enviame lo que tengas

**Bot (Parsear.respuesta_bot):** Cuando agendemos la visita, el agente de Nodo Propiedades te va a recibir en el inmueble. el link para que elijas el horario y despues confirmamos

- exec_id: 12895
- status: success
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- telegram_enviado: Cuando agendemos la visita, el agente de Nodo Propiedades te va a recibir en el inmueble. el link para que elijas el horario y despues confirmamos
- latencia_ms: 1588

## Criterio 4 — Recontacto (saludo corto)

id: `criterio-4-recontacto`

### Turno

**Cliente:** hola como andas

**Bot (Parsear.respuesta_bot):** Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?

- exec_id: 12921
- status: error
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: frio
- latencia_ms: 1579

## Criterio 5 — Mensaje repetido

id: `criterio-5-repetido`

### Turno

**Cliente:** tenes algo en Maipu

**Bot (Parsear.respuesta_bot):** Listo, cualquier cosa avisame

- exec_id: 12901
- status: success
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- telegram_enviado: Listo, cualquier cosa avisame
- latencia_ms: 1586

### Turno

**Cliente:** tenes algo en Maipu

**Bot (Parsear.respuesta_bot):** Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?

- exec_id: 12918
- status: success
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- telegram_enviado: Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?
- latencia_ms: 1578

## Criterio informal/grosero

id: `criterio-informal`

### Turno

**Cliente:** che boludo mandame deptos baratos

**Bot (Parsear.respuesta_bot):** Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?

- exec_id: 12921
- status: error
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: frio
- latencia_ms: 1599

## Criterio 10 — Ráfaga 5 msgs <1 min

id: `criterio-10-rafaga`

### Turno

**Cliente:** hola

**Bot (Parsear.respuesta_bot):** Mira, estas te pueden cerrar

**Cierre:** Si queres te cuento mas de alguna

- exec_id: 12922
- status: error
- propiedades_mostrar: `["MZA-017","MZA-020","MZA-008"]`
- rate_limit: true
- temperatura: frio
- groq_error: `{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01kn08t56hfd79x31vfpcnwxbf` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6677, Requested 4983. Please try again in 27.45s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.`
- latencia_ms: 1594

### Turno

**Cliente:** busco depto

**Bot (Parsear.respuesta_bot):** Dame un segundo que se me trabo, ya te contesto

- exec_id: 12923
- status: error
- propiedades_mostrar: `[]`
- rate_limit: true
- temperatura: frio
- groq_error: `{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01kn08t56hfd79x31vfpcnwxbf` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6082, Requested 4755. Please try again in 21.2775s. Need more tokens? Upgrade to Dev Tier today at https://console.gro`
- latencia_ms: 1559

### Turno

**Cliente:** hasta 90 mil

**Bot (Parsear.respuesta_bot):** Dame un segundo que se me trabo, ya te contesto

- exec_id: 12923
- status: error
- propiedades_mostrar: `[]`
- rate_limit: true
- temperatura: frio
- groq_error: `{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01kn08t56hfd79x31vfpcnwxbf` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6082, Requested 4755. Please try again in 21.2775s. Need more tokens? Upgrade to Dev Tier today at https://console.gro`
- latencia_ms: 1557

### Turno

**Cliente:** en godoy cruz

**Bot (Parsear.respuesta_bot):** En maipu mira estas

**Cierre:** Si queres te cuento mas de alguna

- exec_id: 12929
- status: error
- propiedades_mostrar: `["MZA-022","MZA-010","MZA-015"]`
- rate_limit: false
- temperatura: tibio
- latencia_ms: 1565

### Turno

**Cliente:** mostrame opciones

**Bot (Parsear.respuesta_bot):** Te mando estas para que veas

**Cierre:** Si queres te cuento mas de alguna

- exec_id: 12926
- status: error
- propiedades_mostrar: `["MZA-017","MZA-020","MZA-008"]`
- rate_limit: true
- temperatura: tibio
- groq_error: `{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01kn08t56hfd79x31vfpcnwxbf` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 3931, Requested 5192. Please try again in 8.422499999s. Need more tokens? Upgrade to Dev Tier today at https://console`
- latencia_ms: 1563

Duración ráfaga total: 51390 ms
