# Nodo Propiedades

CRM inmobiliario en **n8n**: bots por canal (Telegram / WhatsApp / Messenger), IA vía **Groq**, persistencia en **Google Sheets**.

## Arranque (lo práctico hoy)

1. Leer **`docs/ARRANQUE-LOCAL.md`**
2. `docker compose up -d` → n8n en http://localhost:5678
3. WhatsApp: **Meta Cloud API** — ver `docs/WHATSAPP-CLOUD-META.md` y `pnpm run patch-meta-all`
4. Importar workflows de `workflows/SIMPLE-*.json` y reemplazar placeholders `__SET_*__`
5. Credenciales solo en n8n / archivos `.env` locales (**nunca en git**)

### Stack documentado vs stack en uso

| | En repo / docs “Meta final” | Uso local habitual |
|--|----------------------------|-------------------|
| IA | Ollama + AI Agent (WF-00…13) | **Groq** (`openai/gpt-oss-120b`) en bots SIMPLE / bot TG en n8n |
| WhatsApp | Meta Cloud API | **Meta Cloud API** (`meta-whatsapp` webhook) |
| Sheets CRM | `Leads` / `Interacciones` (csv/) | **`Leads_Bot` + `Consultas`** |

Los workflows `WF-*` archivados en `docs/_legacy/` son un plan de despliegue Meta/Ollama; no son el runtime mínimo de los SIMPLE.

## Tesis (UTN FRM)

- Versión evaluada: commit `3f132c3` (24/08/2026), tag `tesis-evaluacion-3f132c3`.
- Comparación SIMPLE-01 vs IA: se agregó en `ff70391` (27/08). Ese commit solo suma el CSV y una línea del README de validación.
- Evidencia en `docs/validacion/`. Anexo F en `docs/tesis/anexo-F-SYSTEM_MIN.md`.
- Reproducir la prueba de componente (un turno, prompt mínimo, no el flujo n8n): `py -3 scripts/run_validacion_batch.py` con `GROQ_API_KEY` en el entorno. Comparación: `py -3 scripts/comparar_simple01_vs_ia.py`.
- Todo lo posterior a `3f132c3` es desarrollo que excede lo evaluado.

## Secretos

- Tokens de bots, API keys, `.env*` **no se versionan**
- En Telegram HTTP: usar `bot__SET_TELEGRAM_BOT_TOKEN__/` o la credencial n8n
- Si un token llegó a un commit viejo: **revocarlo** en BotFather / proveedor y generar uno nuevo

## Carpetas

| Carpeta | Contenido |
|---------|-----------|
| `workflows/` | JSON SIMPLE-01…04 (plantillas) |
| `docs/` | Documentación (arranque, Meta/legacy, runbooks) |
| `scripts/` | Utilidades de import/setup (sin dumps de sesión) |
| `config/` | Manifiesto / ejemplos (sin credentials reales) |
| `ai/` | Prompt y schema del AI Agent (plan/WF; no siempre cableado) |
| `csv/` | Esquemas de ejemplo para Sheets |

## Scripts legacy (n8n cerrado si tocan SQLite)

Ver `docs/_legacy/LEER PRIMERO - Meta Produccion Final.md` y scripts `_post_import.js`, etc., si retomás el stack completo WF/Meta.

