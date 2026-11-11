# Integridad v1.1

- Tag base: `tesis-evaluacion-3f132c3`
- Build: 2026-11-11T22:19:52.596Z
- Workflow: `workflows/tesis/Bot Telegram Inmobiliaria v1.1.json`

## Hashes (deben coincidir con el tag)

| Pieza | Tag / esperado | v1.1 |
|---|---|---|
| Construir Prompt | `dedafd37277aa635c23fe7560ec06c333f6fcf52a4be96a00a34a4b960fc2d22` | `dedafd37277aa635c23fe7560ec06c333f6fcf52a4be96a00a34a4b960fc2d22` |
| HTTP Groq jsonBody | `3a8476586d89bec8b21976debc1b67be134622fa119af0b7a46f80075bc9318f` | `3a8476586d89bec8b21976debc1b67be134622fa119af0b7a46f80075bc9318f` |
| Parsear Respuesta Base (jsCode) | `f8fd0db598d7eaab8b5c730d77c635267537d938f0bfa0d108594ab39d752c97` | `f8fd0db598d7eaab8b5c730d77c635267537d938f0bfa0d108594ab39d752c97` |
| SYSTEM_MIN (Anexo F) | `03c136d84c9c2878a1ff9339a143222644e368456991b47bec89a13ac7d57a44` | `03c136d84c9c2878a1ff9339a143222644e368456991b47bec89a13ac7d57a44` |

## Diff completo vs tag (solo puntos 1–6)

### Nodos
- Renombrado: `Parsear Respuesta` → `Parsear Respuesta Base`
- Agregado: `Preparar Clasificación`
- Agregado: `HTTP Groq Clasificador`
- `Telegram Responder`: expresiones `$('Parsear Respuesta')` → `$('Parsear Respuesta Base')`

### Conexiones
- `HTTP Groq` → `Parsear Respuesta Base`
- `Parsear Respuesta Base` → `Telegram Responder`, `Preparar Clasificación`
- `Preparar Clasificación` → `HTTP Groq Clasificador` → `Parsear Respuesta`
- `Parsear Respuesta` → `Actualizar Historial`, `IF Lead Completo`, `Registrar Consulta Telegram`, `Sync Leads_Bot`, `Emit Panel Realtime`

SHA-256 JSON v1.1: `fc941524a6571d05894778375e05b48d1a00d579838b7c6b1224fedaf1889b0c`
