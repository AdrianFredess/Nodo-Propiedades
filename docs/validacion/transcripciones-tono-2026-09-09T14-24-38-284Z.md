# Transcripciones validacion tono / 429 (match por texto_usuario)

- Fecha: 2026-09-09T14:24:38.284Z
- n8n: 2.12.3 (npx) + ngrok
- Workflow: Bot Telegram Inmobiliaria (8JoSfkcn3pE1f0av)
- chat_id prueba: 999888777

> Fuente: ejecuciones n8n; emparejado por texto_usuario == mensaje enviado.

## Criterio 1 — Saludo

id: `criterio-1-saludo`

### Turno

**Cliente:** hola

**Bot (Parsear.respuesta_bot):** Buenas, soy Matias de Nodo Propiedades. En que te puedo ayudar?

- exec_id: 12932
- status: error
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- latencia_ms: 6100
- webhook_status: 200

## Criterio 2 — Pedido de fichas

id: `criterio-2-fichas`

### Turno

**Cliente:** enviame lo que tengas

**Bot (Parsear.respuesta_bot):** Mira, estas te pueden cerrar

**Cierre:** Si queres te cuento mas de alguna

- exec_id: 12934
- status: error
- propiedades_mostrar: `["MZA-022","MZA-010","MZA-015"]`
- rate_limit: false
- temperatura: tibio
- latencia_ms: 8092
- webhook_status: 200

## Criterio 4 — Recontacto (saludo corto)

id: `criterio-4-recontacto`

### Turno

**Cliente:** hola como andas

**Bot (Parsear.respuesta_bot):** Todo bien, que tipo de inmueble o zona te interesa?

- exec_id: 12935
- status: error
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- latencia_ms: 8078
- webhook_status: 200

## Criterio 5 — Mensaje repetido

id: `criterio-5-repetido`

### Turno

**Cliente:** tenes algo en Maipu

**Bot (Parsear.respuesta_bot):** En Maipu tengo un lote y dos inmuebles que entran en tu rango. Cual de estas te cierra mas?

- exec_id: 12936
- status: error
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- latencia_ms: 10094
- webhook_status: 200

### Turno

**Cliente:** tenes algo en Maipu

**Bot (Parsear.respuesta_bot):** Entiendo, te gustaria que te pase los datos de esas opciones o tenes alguna preferencia en tipo o precio?

- exec_id: 12937
- status: error
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- latencia_ms: 6070
- webhook_status: 200

## Criterio informal/grosero

id: `criterio-informal`

### Turno

**Cliente:** che boludo mandame deptos baratos

**Bot (Parsear.respuesta_bot):** Mira, estas te pueden cerrar

**Cierre:** Si queres te cuento mas de alguna

- exec_id: 12938
- status: error
- propiedades_mostrar: `["MZA-022","MZA-026"]`
- rate_limit: false
- temperatura: tibio
- latencia_ms: 6072
- webhook_status: 200

## Criterio 10 — Rafaga 5 msgs <1 min

id: `criterio-10-rafaga`

### Turno

**Cliente:** hola

**Bot (Parsear.respuesta_bot):** Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?

- exec_id: 12939
- status: error
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- latencia_ms: 6095
- webhook_status: 200

### Turno

**Cliente:** busco depto

**Bot (Parsear.respuesta_bot):** Mira estas de maipu

**Cierre:** Si queres te armo visita a la que mas te cierre

- exec_id: 12940
- status: error
- propiedades_mostrar: `["MZA-022","MZA-010","MZA-015"]`
- rate_limit: true
- temperatura: tibio
- groq_error: `{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01kn08t56hfd79x31vfpcnwxbf` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 4917, Requested 5055. Please try again in 14.79s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate`
- latencia_ms: 10106
- webhook_status: 200

### Turno

**Cliente:** hasta 90 mil

**Bot (Parsear.respuesta_bot):** En maipu mira estas

**Cierre:** Si queres te cuento mas de alguna

- exec_id: 12941
- status: error
- propiedades_mostrar: `["MZA-022","MZA-010","MZA-015"]`
- rate_limit: true
- temperatura: tibio
- groq_error: `{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01kn08t56hfd79x31vfpcnwxbf` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 2956, Requested 5153. Please try again in 817.5ms. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rat`
- latencia_ms: 12106
- webhook_status: 200

### Turno

**Cliente:** en godoy cruz

**Bot (Parsear.respuesta_bot):** En Godoy Cruz tengo un depto que entra en tu rango. la ficha: Cual de estas te cierra mas?

- exec_id: 12942
- status: error
- propiedades_mostrar: `[]`
- rate_limit: false
- temperatura: tibio
- latencia_ms: 8072
- webhook_status: 200

### Turno

**Cliente:** mostrame opciones

**Bot (Parsear.respuesta_bot):** Mira, estas te pueden cerrar

**Cierre:** Si queres te cuento mas de alguna

- exec_id: 12943
- status: error
- propiedades_mostrar: `["MZA-004","MZA-010","MZA-015"]`
- rate_limit: true
- temperatura: tibio
- groq_error: `{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01kn08t56hfd79x31vfpcnwxbf` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 4870, Requested 5149. Please try again in 15.1425s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"ra`
- latencia_ms: 10083
- webhook_status: 200

Duracion rafaga (5 turnos exec 12939–12943): ~47s de latencia acumulada + gaps 2.5s; todas las respuestas llegaron (varias con rate_limit=true y fallback/IDs). El valor anterior ~271s incluia por error toda la corrida con pausas anti-TPM.
