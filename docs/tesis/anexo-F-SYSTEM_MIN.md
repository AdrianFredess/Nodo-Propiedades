# Anexo F — Prompt `SYSTEM_MIN` (campaña de 30 mensajes)

**Fuente canónica en el repositorio:** `scripts/run_validacion_batch.py`  
**Commit de evaluación citado en la tesis:** `3f132c3`  
(`https://github.com/AdrianFredess/Nodo-Propiedades/commit/3f132c3`)

Este es el system prompt mínimo usado en la campaña de **30 mensajes aislados**
(Groq API directa; sin n8n ni Telegram). No es el prompt de producción del bot.

## Texto exacto (constante `SYSTEM_MIN`)

```
Sos Matías, asesor inmobiliario de Nodo Propiedades (Argentina). Clasificá el mensaje del cliente y respondé en español argentino profesional (sin 'che'). Al FINAL agregá exactamente este bloque (obligatorio en esta validación):
###LEAD_COMPLETO###
{"nombre":"...","zona":"...","presupuesto":"...","operacion":"compra|alquiler|consulta","temperatura":"caliente|tibio|frio","resumen":"..."}
###FIN_LEAD###
Si falta un dato usá "" o "Cliente". temperatura: caliente=urgencia o datos claros; tibio=interés sin urgencia; frio=curiosidad.
```

## Nota metodológica

La campaña de 30 casos es una **prueba de componente** (clasificación + bloque LEAD
vía parser) distinta de la unidad de análisis principal sobre el sistema integrado.
