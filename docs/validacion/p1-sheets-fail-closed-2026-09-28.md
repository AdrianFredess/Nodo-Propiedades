# P1 — Sheets fail-closed

- Copia: `Mxi0429GVuyyl8sy` (`CHECK P1 sheets fail-closed`). Producción `8JoSfkcn3pE1f0av` no se usó como destino del mensaje.
- `Leer Stock Propiedades` de la copia devuelve `invalid_grant` (nodo Code, credencial de Sheets no se llama).
- 3 mensajes en menos de 10 minutos.
- Alertas de Telegram Alerta Owner que corrieron: **1**.
- Nodo de revisión presente en ejecuciones: **3**.

## Filas

- 13747 | respuesta="Dame un rato que chequeo disponibilidad y te confirmo" | props=[] | sheets_error=true | aviso=true | motivo=sheets_error | revision=sheets_error | sheets_write=success | precio_o_ficha=false | alerta_nodo=success
- 13748 | respuesta="Dame un rato que chequeo disponibilidad y te confirmo" | props=[] | sheets_error=true | aviso=false | motivo=sheets_error | revision=sheets_error | sheets_write=success | precio_o_ficha=false | alerta_nodo=no
- 13749 | respuesta="Dame un rato que chequeo disponibilidad y te confirmo" | props=[] | sheets_error=true | aviso=false | motivo=sheets_error | revision=sheets_error | sheets_write=success | precio_o_ficha=false | alerta_nodo=no
