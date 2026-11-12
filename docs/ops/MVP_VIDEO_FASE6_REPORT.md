# MVP Video — Fase 6 REPORT (demo)

Fecha: 2026-11-12 · Rama `mvp/video`

## Hecho

- **Politicas_Pago** (STOP 2 aprobado): valores demo Mendoza, marcados `DEMO`, **sin CBU/alias/cuentas reales**. Aplicados a la planilla de stock y a `csv/Politicas_Pago.csv`. Backup en `docs/ops/backup-planillas-2026-11-12/` (gitignore).
- **`pnpm demo:reset`** (`scripts/mvp/demo-reset.js`): borra solo `DEMO_CHAT_IDS` en Historial, `Leads_Bot`, `Consultas` y `Leads_Completos`. Confirmación `BORRAR DEMO`. Corrida OK (limpió chats de prueba F1/F2).
- **`ARRANQUE.bat`**: documenta PANEL-07 y Bot Prueba Panel + comandos de deploy.
- **Bot Prueba Panel**: fix de deploy n8n 2.x (`settings` solo `executionOrder`).

## Checks / STOP (no bloquean el commit)

- Conversación escena 3 + alerta dueño: requiere grupo Telegram "Ventas" (Fase 6b.4).
- Jerga técnica en UI / build panel: se cierra en Fase 7.6.
- Catálogo MZA-031…034 + fotos: Fase 6b.

## Cómo resetear demo

```bash
# .env: DEMO_CHAT_IDS=...
pnpm demo:reset
# confirmar: BORRAR DEMO
```
