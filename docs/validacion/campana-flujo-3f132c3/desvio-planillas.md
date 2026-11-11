# Desvío planillas — campaña 3f132c3

## Problema
- Tag: Guardar Lead → `18eZ…` / `Sheet1` + `chat_id`.
- Realidad Drive: ese archivo no tiene `Sheet1` (solo `Hoja 1` vacía).
- Prompt: CRM `1-0IBpa…`. Producción actual: `1a84OL3Y…` con tabs `Leads_Bot` y `Consultas`.
- Drive API deshabilitada en el proyecto Google → no se pudo “Hacer una copia” por API.

## Solución aplicada (pedido de Adrián: solucionar todo)
- historial: copia ya hecha por Adrián `17OcN_WHHrAchUAfTxLTrjsB-cpz8nB1H2p6eeVvS_XM` + clear A2:ZZ.
- guardar_lead: copia `1LzSwmJYnrQ5Rc1SpCpY19rLe86LVDfnv2mM1w1aPBiY` + creación de `Sheet1` con columnas del tag.
- leads_bot_consultas: spreadsheet nuevo `1tjwpgB4V5kd_IsR3BY_bAFc4K5aTp0BdcYhC4fzVia8` con headers de prod `Leads_Bot`/`Consultas`.

## Headers CRM (prod)
- Leads_Bot: chat_id | nombre | zona | canal_origen | estado_seguimiento | ultima_actualizacion | temperature | presupuesto | lead_completo | dedupe_key | last_message | status | tipo_operacion | propiedad_seguimiento | lead_name | source
- Consultas: spreadsheetId | sheetId | title | index | sheetType | gridProperties

```json
{
  "historial": "17OcN_WHHrAchUAfTxLTrjsB-cpz8nB1H2p6eeVvS_XM",
  "guardar_lead": "1LzSwmJYnrQ5Rc1SpCpY19rLe86LVDfnv2mM1w1aPBiY",
  "leads_bot_consultas": "1tjwpgB4V5kd_IsR3BY_bAFc4K5aTp0BdcYhC4fzVia8"
}
```
