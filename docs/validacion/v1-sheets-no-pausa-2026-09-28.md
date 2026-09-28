# V1 — Sheets no deja el chat pausado

- Copia: `oNegw1W7XKIINXgt`. Producción `8JoSfkcn3pE1f0av` no recibió estos mensajes.
- 3 chats con la lectura rota, espera de 21s y un mensaje de cierre para disparar la alerta de la ráfaga (20s).
- Alertas cuyo texto lista los 3 chats: **1**.
- Aviso de recuperación con los 3 chats: **1**.
- El mensaje siguiente, con Sheets bien, no queda pausado ni usa el texto de Sheets caído: **sí**.

## Filas

- 13858 | chat=891310001 | respuesta="Dame un rato que chequeo disponibilidad y te confirmo" | paused=no | sheets_error=true | aviso=false | motivo=sheets_error | aviso_txt="AVISO NODO - DERIVACION C\nCliente: Ana\nCanal: telegram\nMotivo: sheets error\nZona: -\nPresupuesto: -\nOperacion: -\nUrgencia: -\nResumen: hola soy ana\nPanel: http://localhost:5173/leads/telegram%3A891310001"
- 13859 | chat=891310002 | respuesta="Dame un rato que chequeo disponibilidad y te confirmo" | paused=no | sheets_error=true | aviso=false | motivo=sheets_error | aviso_txt="AVISO NODO - DERIVACION C\nCliente: Luis\nCanal: telegram\nMotivo: sheets error\nZona: -\nPresupuesto: -\nOperacion: -\nUrgencia: -\nResumen: hola soy luis\nPanel: http://localhost:5173/leads/telegram%3A891310002"
- 13860 | chat=891310003 | respuesta="Dame un rato que chequeo disponibilidad y te confirmo" | paused=no | sheets_error=true | aviso=false | motivo=sheets_error | aviso_txt="AVISO NODO - DERIVACION C\nCliente: Mia\nCanal: telegram\nMotivo: sheets error\nZona: -\nPresupuesto: -\nOperacion: -\nUrgencia: -\nResumen: hola soy mia\nPanel: http://localhost:5173/leads/telegram%3A891310003"
- 13862 | chat=891310001 | respuesta="Dame un rato que chequeo disponibilidad y te confirmo" | paused=no | sheets_error=true | aviso=true | motivo=sheets_error | aviso_txt="Sheets caído: Leer Stock Propiedades invalid_grant: The provided authorization grant is invalid\n- Ana | telegram | 891310001 | sigo esperando\n- Luis | telegram | 891310002 | hola soy luis\n- Mia | telegram | 891310003 | hola soy mia"
- 13863 | chat=891310001 | respuesta="Te mando estas para que veas" | paused=no | sheets_error=false | aviso=true | motivo=auto | aviso_txt="Sheets volvió, quedaron 3 clientes esperando respuesta:\n- Ana | telegram | 891310001 | sigo esperando\n- Luis | telegram | 891310002 | hola soy luis\n- Mia | telegram | 891310003 | hola soy mia\nAVISO NODO - LEAD\nCliente: Ana\nCanal: telegram\nMotivo: auto\nZona: godoy cruz\nPresupuesto: -\nOperacion: -\nUrgencia: -\nResumen: hola de nuevo, que tenes en godoy cruz\nPanel: http://localhost:5173/leads/telegram"
