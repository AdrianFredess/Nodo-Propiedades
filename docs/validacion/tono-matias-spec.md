# Validación — Spec Tono y Flujo Matías (+ Parche 2)

Checklist de aceptación. Probar en Telegram (y WA si aplica) con lead de prueba.

## Spec tono/flujo (1–9)

| # | Entrada | Esperado | OK? |
|---|---|---|---|
| 1 | `hola` (primer mensaje) | Saludo: `Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?` — sin fichas, sin "bienvenido" | ☐ |
| 2 | `enviame lo que tengas` / `mandame opciones` / `a ver que tenes` | `mostrar_stock=true`, fichas reales del stock, línea humana antes | ☐ |
| 3 | Zona + presupuesto + tipo en un solo mensaje | NO vuelve a preguntar esos datos; filtra y muestra | ☐ |
| 4 | Recontacto >12h / día distinto + `hola` / `como andas` | NO menciona presupuesto/zona viejos de entrada | ☐ |
| 5 | Mismo mensaje del cliente 2 veces seguidas | Fichas (no repetir la misma respuesta) | ☐ |
| 6 | Error 429 / Groq caído | Retry ~3s; si falla: `Dame un segundo que se me trabo, ya te contesto` (rate limit) o `Perdon, se corto un toque...` — o fichas si ya pedía stock. Nunca vacío ni `Hola]` | ☐ |
| 7 | Cualquier respuesta | 1–3 oraciones, sin doble `!!`/`¿`, tildes bajadas en que/como/mas/dias/tenes/Matias | ☐ |
| 8 | Lead con zona+presupuesto+tipo+urgencia | Panel muestra frío/tibio/caliente (no se queda en "Conversando") | ☐ |
| 9 | Charla 15–20 turnos | Ninguna respuesta cortada a mitad por tokens | ☐ |

## Parche 2 — Entrega de fichas + 429 (10–13)

| # | Prueba | Resultado esperado | OK? |
|---|---|---|---|
| 10 | 4–5 mensajes seguidos en <1 min (cliente rápido) | Todas las respuestas completas; si correspondía fichas, llegan (nunca "te muestro" sin entregar) | ☐ |
| 11 | Forzar 429 (límite real o mock) | Reintento; si falla de nuevo, fallback rate limit al cliente; nunca silencio | ☐ |
| 12 | Revisar hoja `Conversaciones_Revision` tras carga | Registros con motivo `rate_limit` si el límite se alcanzó | ☐ |
| 13 | Muestra de conversaciones con varios mensajes seguidos | Ninguna respuesta promete entrega sin que esa entrega llegue en el mismo turno | ☐ |

## Causa raíz (verificada, Jorge 8/9 ~10:43 AR)

- Groq `openai/gpt-oss-120b` plan free: **8.000 TPM**.
- Exec n8n con 429 `rate_limit_exceeded`.
- Parsear armó texto + `propiedades_mostrar`, pero el workflow TG **no tenía nodos de fotos cableados** → solo se envió el texto.

## Arquitectura (entrega)

1. Parsear fuerza IDs + intro corta cuando hay que mostrar.
2. `Telegram Responder` (texto) → `Preparar Fotos Propiedad` → envío de fotos → cierre.
3. Prohibido narrar "te muestro / ahí van" sin `###MOSTRAR_PROPIEDADES###` / IDs reales en el mismo turno.
4. HTTP Groq: `retryOnFail` (1 reintento, ~3s) + `neverError` + fallback específico 429.
5. Prompt más liviano: stock filtrado (máx. 8) + historial prompt máx. 8 msgs.

## Copy de referencia

**Saludo:** `Buenas, soy Matias de Nodo Propiedades. En que puedo ayudarte?`

**Fallback genérico:** `Perdon, se corto un toque. Me repetis que necesitas?`

**Fallback rate limit:** `Dame un segundo que se me trabo, ya te contesto`

## Parche 3 — Detalle / visita / handoff

| # | Prueba | Esperado |
|---|---|---|
| 14 | `contame de la ultima` | 2–3 burbujas con zona, tipo, desc, precio (no solo dirección) + ficha |
| 15 | `quien me va a estar esperando` | Respuesta concreta: agente Nodo en el inmueble (+ link si hay) |
| 16 | `que dia puede ser?` / coordina visita | Link agenda + avisa asesor + `bot_paused=si` (IA deja de responder) |
| 17 | `ok` despues de visita | Handoff; siguiente mensaje del cliente no responde la IA |
| 18 | 429 + cliente no escribe ~60s | Reenvio automatico de ficha o link |

## Nota operativa Groq

Plan gratis: 8K TPM. Upgrade "Revelador" a veces bloqueado por demanda. Mientras: prompt chico + retry + reenvio 60s.
