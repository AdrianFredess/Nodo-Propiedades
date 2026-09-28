# Integridad — copia `TESIS-3f132c3 Clasificacion`

- Fecha de la corrida: 2026-09-28T20:46:53Z
- Commit fuente: `3f132c3`
- Workflow copia: `pAoeaGKRj49HvgJq` (inactivo al terminar; se activó solo para recibir el webhook de prueba)
- Workflow de producción `8JoSfkcn3pE1f0av`: no se modificó

## Hashes SHA-256 (idénticos)

| Pieza | `3f132c3` y copia |
|---|---|
| `Construir Prompt` jsCode | `dedafd37277aa635c23fe7560ec06c333f6fcf52a4be96a00a34a4b960fc2d22` |
| `Parsear Respuesta` jsCode | `f8fd0db598d7eaab8b5c730d77c635267537d938f0bfa0d108594ab39d752c97` |
| `HTTP Groq` jsonBody | `3a8476586d89bec8b21976debc1b67be134622fa119af0b7a46f80075bc9318f` |

## Trigger

- Reemplazado: `Telegram Trigger` → `Webhook` POST `tesis-3f132c3-clasificacion`
- Nodo extra `Normalizar Update Telegram`: n8n envuelve el POST en `body`. Este nodo devuelve el update `{message:{chat,from,text}}` para no tocar `Set Variables`.
- Después del smoke, se cortó la salida de `Parsear Respuesta` hacia el resto, para que los nodos de efecto no se ejecuten.

## Nodos deshabilitados

Pedidos:

- `Telegram Responder`
- `Email Lead Caliente`
- `Telegram Alerta Owner`
- `Emit Panel Realtime`
- `Emit Lead Updated`

Escritura a Sheets, también deshabilitados (no se pudo crear una copia en Drive desde acá; así no se escribe el spreadsheet de producción):

- `Guardar Lead`
- `Actualizar Historial`
- `Sync Leads_Bot`
- `Registrar Consulta Telegram`

En la corrida de los 30 (`13699`–`13729`) ninguno de esos nodos corrió.

## Stock

- Spreadsheet de lectura (el del commit): `1sAXgJDFkFbiLPDdqw4vYyCeVC4heWAJ3n92jlrIW-SU`, hoja `Hoja 1`
- Credencial: la misma de producción (`Cuenta de Google Sheets`)
- Resultado de `Leer Stock Propiedades`: **falló** con `invalid_grant` (refresh token vencido). La misma falla aparece en la ejecución de producción `13694` de hoy.
- Propiedades leídas: **0** (28/09/2026). El ítem único del nodo es el error de OAuth, no una ficha.
- No hay copia de Drive. El catálogo no se consultó.

## Esta corrida no vale para la tesis

CSV renombrado: `resultados_clasificacion_flujo3f132c3_2026-09-28T20-46-53-894Z-INVALIDA.csv`.

- Las 15 filas con respuesta vacía (CAL-07, CAL-10, TIB-11, TIB-12, TIB-14, TIB-15, TIB-16, TIB-17, TIB-20, FRI-21, FRI-23, FRI-24, FRI-25, FRI-29, FRI-30) cortaron en `HTTP Groq`. `Parsear Respuesta` no corrió.
- HTTP status: **429** en las 15. Mensaje de Groq: límite TPM 8000 del modelo `openai/gpt-oss-120b`. El header `retry-after` no vino. El cuerpo dice `try again in …` (milisegundos o segundos, según la fila).
- CAL-01 (exec 13699) también tiene `invalid_grant` en el ítem de stock, y aun así Groq respondió. El corte de las 15 no es el OAuth: es el 429.
- Las 15 que respondieron lo hicieron con stock vacío. No miden el sistema evaluado.
- Re-corrida con chat `891000001`–`891000030` y espaciado ≥30 s: **no se hizo**. Precondición: `Leer Stock Propiedades` tiene que devolver más de 0 propiedades. Hoy sigue en 0.

## Sheets en producción (últimas 20 ejecuciones de `8JoSfkcn3pE1f0av`)

Las 20 fallan `invalid_grant` en `Leer Historial`, `Leer Stock Propiedades`, `Leer Politicas Pago` y `Actualizar Historial`. `Guardar Lead` y `Sync Leads_Bot` no aparecen en esas 20 ejecuciones. SIMPLE-02 (`npq6sC6YLaUBpHac`): 0 ejecuciones recientes en la API.

## Escrituras en producción

0 en esta corrida. El smoke `13698` (antes de cortar las salidas) mostró los nodos deshabilitados como pass-through del JSON de Parsear, sin respuesta de Sheets ni `message_id` de Telegram.
