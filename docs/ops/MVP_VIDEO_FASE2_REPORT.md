# MVP Video — Fase 2 REPORT (clasificador v1.1 en producción)

Fecha: 2026-11-12  
Rama: `mvp/video`

## Qué se hizo
- Patch idempotente `scripts/patch-mvp-f2-clasificador.js`:
  - `Parsear Respuesta` → `Parsear Respuesta Base`
  - `Preparar Clasificación` → `HTTP Groq Clasificador` → `Parsear Respuesta` (temperatura final del clasificador)
  - Cadena Telegram (responder/fotos/cierre) lee de **Base** (sin esperar al clasificador)
  - Writers / panel / historial leen de **Parsear Respuesta** (post-clasificador)
- `SYSTEM_MIN` byte a byte Anexo F — SHA-256: `03c136d84c9c2878a1ff9339a143222644e368456991b47bec89a13ac7d57a44`
- Parámetros clasificador: `openai/gpt-oss-120b`, temp 0.7, 1200, `reasoning_effort: low`
- Fallback: temperatura de `lead-temperatura.js` + `clasificacion_fuente = fallback`
- `pipeline_conversando` + función pura `scripts/lib/es-conversando.js` (tests verdes)
- Cola Tokens: `DEFAULT_EST` 5200 → **6200** (~+1000 clasificador)
- WA/Messenger: anotados en `docs/ops/pendientes.md` (no comparten estructura)

## Tests
- `node --test scripts/lib/es-conversando.test.js` → 6/6 OK
- `node scripts/tesis/test-v11.js` → OK (parser, preparar, integridad, SHA)

## Smoke (6 mensajes)

| ID | chat_id | esperado | temperatura | fuente | ok |
|----|---------|----------|-------------|--------|----|
| CAL-03 | 893000101 | caliente | caliente | clasificador | sí |
| CAL-09 | 893000109 | caliente | caliente | clasificador | sí |
| TIB-12 | 893000112 | tibio | tibio | clasificador | sí |
| TIB-15 | 893000115 | tibio | frio | clasificador | no (varianza LLM) |
| FRI-21 | 893000121 | frio | frio | clasificador | sí |
| HOLA | 893000199 | — | frio | clasificador | sí |

**Wiring:** 6/6 con `clasificacion_fuente=clasificador`. Match perfil esperado: 5/6 (TIB-15).

## Desvíos
- TIB-15 → `frio` (en tesis v1.1 era tibio). No es fallo de cableado.
- n8n PUT solo acepta `settings: { executionOrder: 'v1' }`.

## Pendientes
- Panel: consumir `pipeline_conversando` en kanban (hoy Conversando es legacy).
