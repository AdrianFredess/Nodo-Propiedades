# Owner group Ventas — setup

Fecha: 2026-11-13 · Rama `mvp/video`

## Hecho
- `OWNER_TELEGRAM_CHAT_ID` en `.env` = chat del grupo (negativo, len 11). No se publica el valor.
- `DEMO_CHAT_IDS` incluye ese chat.
- `patch-mvp-06b-catalogo.js --deploy`: nodos `Telegram Alerta *` apuntan al grupo.
- `patch-mvp-ignore-owner.js --deploy`: el bot ignora mensajes del grupo (sin respuesta, lead ni historial). Tests `ignore-owner-chat.test.js` OK.
- Limpieza de planillas del owner: 0 filas (el `/start@` no dejó lead persistido).
- Aviso de prueba al grupo: **OK** (`message_id` 333, `chatType=group`).

## Cómo verificar
1. En el grupo no debe responder Matías a mensajes normales.
2. Un lead caliente de un cliente debe mandar 🔥 al grupo Ventas.
