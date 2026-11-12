# MVP video — Fase 4 (Entrevista)

## Entregado

- Panel `/config`: botón **Configurar con una entrevista**, 8 preguntas, progreso, saltear, atrás, máx. 800 caracteres.
- Workflow `PANEL-07 Entrevista Config` (webhook `panel-entrevista-config`, `X-Panel-Token`, Groq 0.4 / 1200).
- Validador `scripts/lib/entrevista-draft-validator.js` + tests.
- Formulario de revisión y guardado en `bot-config` (historial P6).
- `Construir Prompt`: sección **Cómo trabaja esta inmobiliaria** (después de reglas de no inventar, máx. 2500).
- Ejemplo: `docs/ops/entrevista-ejemplo.json`.

## Checks

```bash
node --test scripts/lib/entrevista-draft-validator.test.js
node scripts/patch-mvp-f4-entrevista.js
cd front && pnpm build
```

Deploy opcional (requiere n8n local + API key):

```bash
node scripts/patch-mvp-f4-entrevista.js --deploy
```

## Pendiente / trabado

- Prueba E2E con Groq real en n8n si el workflow no está importado/activo en la instancia del operador.
- Check “mensaje de prueba con guía zona” en Telegram: manual tras guardar config de entrevista.
