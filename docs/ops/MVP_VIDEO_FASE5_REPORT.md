# MVP video — Fase 5 (Probar)

## Entregado

- Pantalla `/probar`: chat con respuesta, temperatura y derivación A/B/C.
- `scripts/build-bot-prueba-panel.js`: clona producción → `Bot Prueba Panel` (webhook + token, TG/email/emit off, planillas tesis, `chat_id` `894xxxxxx`).
- `scripts/patch-mvp-f5-probar.js` (idempotente, `--deploy` opcional).
- Aviso permanente + **Empezar de nuevo** (nuevo `chat_id`).

## Checks

```bash
node scripts/build-bot-prueba-panel.js
node scripts/patch-mvp-f5-probar.js
cd front && pnpm build
```

## Pendiente / trabado

- Comparación palabra por palabra con Telegram requiere mensaje en prod y en `/probar` (LLM variable).
- Deploy `--deploy` depende de n8n local activo.
