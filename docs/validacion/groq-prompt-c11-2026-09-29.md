# C11 — prompt más corto (29 sep 2026)

Antes, en la ejecución 13694 de Telegram: `prompt_tokens` 4960, salida 75.

El código nuevo arma el prompt así:

- Stock filtrado por zona, presupuesto u operación ya conocidos, máximo 8. Sin esos datos, máximo 5 variadas.
- Historial: últimos 8 turnos completos y una línea `Antes:` con lo anterior.
- Las reglas largas y los ejemplos se reemplazan por un bloque corto. Se conservan datos, contexto, stock, políticas, el modo del turno y el link de visita.

Estimación local, sin llamar a Groq, sobre el prompt de Telegram con 8 propiedades y políticas: 6085 caracteres, unos 1740 tokens (a 3,5 caracteres por token, la relación de la ejecución 13694).

La medición de `usage.prompt_tokens` antes y después, sobre los mismos 10 mensajes, queda para la primera hora con el bot apagado. No se corrió ahora porque el plan gratis ya está en el tope diario y es horario de atención.
