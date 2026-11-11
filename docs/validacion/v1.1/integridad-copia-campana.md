# Integridad generada — TESIS-v1.1 Campaña
- Base: `workflows/tesis/Bot Telegram Inmobiliaria v1.1.json`
- Fecha build: 2026-11-11T22:20:46.698Z
- Workflow salida: `workflows/tesis/TESIS-v1.1-campana.json`
- Nombre: `TESIS-v1.1 Campaña 2026-11-11`
## Hashes SHA-256
| Pieza | Tag/Base | Copia |
|---|---|---|
| Construir Prompt | `dedafd37277aa635c23fe7560ec06c333f6fcf52a4be96a00a34a4b960fc2d22` | `dedafd37277aa635c23fe7560ec06c333f6fcf52a4be96a00a34a4b960fc2d22` |
| Parsear Respuesta Base | `f8fd0db598d7eaab8b5c730d77c635267537d938f0bfa0d108594ab39d752c97` | `f8fd0db598d7eaab8b5c730d77c635267537d938f0bfa0d108594ab39d752c97` |
| HTTP Groq jsonBody | `3a8476586d89bec8b21976debc1b67be134622fa119af0b7a46f80075bc9318f` | `3a8476586d89bec8b21976debc1b67be134622fa119af0b7a46f80075bc9318f` |
## Planillas de prueba (documentId)
- historial: `17OcN_WHHrAchUAfTxLTrjsB-cpz8nB1H2p6eeVvS_XM`
- guardar_lead: `1LzSwmJYnrQ5Rc1SpCpY19rLe86LVDfnv2mM1w1aPBiY`
- leads_bot_consultas: `1tjwpgB4V5kd_IsR3BY_bAFc4K5aTp0BdcYhC4fzVia8`
## Diff permitido
- Trigger: Telegram Trigger → Webhook POST `tesis-v11-campana` + `Normalizar Update Telegram`
- Nodos deshabilitados: Telegram Responder, Email Lead Caliente, Telegram Alerta Owner, Emit Panel Realtime, Emit Lead Updated
- `HTTP Groq Clasificador`: habilitado
- documentId de historial / Guardar Lead / Leads_Bot+Consultas → copias de prueba
- Resto de nodos, parámetros y conexiones: iguales a la base
SHA-256 del JSON generado: `54a3b47bebc8de842b3fad482271885c979239a62cd5fd4ce5439d6c00457813`