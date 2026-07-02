# OpenSpec — Nodo Propiedades

Este directorio es la **especificación viva del proyecto**: contexto único para Cursor, Claude u otros asistentes sin reexplicar el repo en cada sesión.

## Archivos

| Archivo | Contenido |
|---------|-----------|
| [PROJECT.md](./PROJECT.md) | **Leer primero**: visión, arquitectura, workflows, convenciones, scripts, credenciales, riesgos. |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | Groq, Meta (WhatsApp/Messenger), Telegram, Google Sheets, costos aproximados. |

## Uso rápido

- **Cursor:** regla `.cursor/rules/nodo-propiedades.mdc` (`alwaysApply: true`) resume reglas y enlaza a `openspec/PROJECT.md`.
- **Claude / otro chat:** adjuntá `openspec/PROJECT.md` (y si hace falta `INTEGRATIONS.md`) al inicio del hilo.
- **MCP `user-openspec` en Cursor:** si tu servidor OpenSpec espera *changes* y revisiones aparte, podés **importar** secciones de `PROJECT.md` como documentación cruzada; el texto canónico del negocio vive **aquí en el repo**.

## Mantenimiento

Al agregar un workflow, cambiar placeholders o flujo crítico, actualizá `PROJECT.md` en el mismo PR/commit.
