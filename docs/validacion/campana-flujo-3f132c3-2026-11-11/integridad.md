# Integridad — campaña flujo 3f132c3 (2026-11-11)

## Precondiciones

- n8n Docker `healthz` 200
- Credencial `Cuenta de Google Sheets` reconectada (probe stock: **30** filas)
- Producción `8JoSfkcn3pE1f0av` pausada durante la corrida
- Planillas de prueba: ver `docs/validacion/campana-flujo-3f132c3/desvio-planillas.md`

## Workflow

- Tag: `tesis-evaluacion-3f132c3` (`3f132c3`)
- Copia importada: `bsDzbpEp0K1qY9Nd` (`TESIS-3f132c3 Campaña 2026-11-11`)
- Webhook: `POST /webhook/tesis-3f132c3-campana`

## Hashes SHA-256 (idénticos al tag)

| Pieza | Hash |
|---|---|
| Construir Prompt | `dedafd37277aa635c23fe7560ec06c333f6fcf52a4be96a00a34a4b960fc2d22` |
| Parsear Respuesta | `f8fd0db598d7eaab8b5c730d77c635267537d938f0bfa0d108594ab39d752c97` |
| HTTP Groq jsonBody | `3a8476586d89bec8b21976debc1b67be134622fa119af0b7a46f80075bc9318f` |

## Planillas de prueba

| Rol | documentId |
|---|---|
| historial | `17OcN_WHHrAchUAfTxLTrjsB-cpz8nB1H2p6eeVvS_XM` |
| guardar_lead | `1LzSwmJYnrQ5Rc1SpCpY19rLe86LVDfnv2mM1w1aPBiY` (+ `Sheet1` creada) |
| leads_bot_consultas | `1tjwpgB4V5kd_IsR3BY_bAFc4K5aTp0BdcYhC4fzVia8` |

## Stock snapshot

- Archivo: `stock_snapshot.csv`
- Filas de datos: **30**
- SHA-256: `83fdca32d1f5b395f5c01025ef7734e239a6b5ba040111d589ad5c270be0f571`

## Producción

- Hash nodos+conexiones antes: `ced49e79e72e1ffdc4b6743ee45d3131b3596be13e5e4c339a25464bd16123eb`
- Hash después: `ced49e79e72e1ffdc4b6743ee45d3131b3596be13e5e4c339a25464bd16123eb` (**igual**)
- Estaba activa: sí → se pausó → **reactivada** al cierre
- Copia `bsDzbpEp0K1qY9Nd`: desactivada al cierre

## Corrida

- 30/30 filas; `stock_leido=30` en todas
- Tokens Groq del día (governor): **83007**
- Sin 429, sin rescates, sin `sin_tag`, 0 intentos extra
- Temperaturas crudas: caliente 4, tibio 7, frio 19
- `lead_completo`: 2
- `_ok=no`: historial 0, leads_bot 0, guardar_lead 0
- Exports: historial 32 filas (hdr+smoke+30), Sheet1 3 (hdr+2 leads), Leads_Bot 32, Consultas 32

## Smoke

- chat_id `891999999`, exec `14473`
- `stock_leido=30`, `http_status_groq=200`, `###ESTADO_ACTUAL:frio###`
- `historial_ok=si`, `leads_bot_ok=si`, `guardar_lead_ok=` (sin lead completo)
- tokens: 2755

## Diff permitido (copia vs tag)

- Trigger → Webhook + Normalizar Update Telegram
- 5 nodos efecto deshabilitados
- documentId de historial / Guardar Lead / Leads_Bot+Consultas → planillas de prueba
