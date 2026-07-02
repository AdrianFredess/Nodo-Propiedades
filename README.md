# Sistema Inmobiliario n8n - Meta WhatsApp

Sistema de captación, scoring y seguimiento de leads para inmobiliaria, integrado con Meta WhatsApp Cloud API.

## Inicio rápido

1. **Leé primero**: `docs/LEER PRIMERO - Meta Produccion Final.md`
2. **Estructura**: workflows, docs, scripts, config, ai, csv
3. **Scripts** (n8n **cerrado** para los que tocan `database.sqlite`):
   - `node scripts/_sync_importar_todos_workflows.js` — importa todos los JSON de `workflows/` y quita duplicados por nombre
   - `node scripts/_actualizar_ids_importados.js` — enlaza placeholders `__SET_*__` y prompt del AI Agent en la base
   - `node scripts/_post_import.js` — encadena actualizar IDs + corregir referencias viejas + verificar
   - `node scripts/_eliminar_duplicados_workflows.js` — solo deduplicar por nombre (mantiene el más reciente)
   - `node scripts/_fix_import_n8n2.js --all` — ajusta JSON del repo para n8n 2.x (nodos / Execute Workflow)
   - `node scripts/_fix_switch_v2_n8n.js` — corrige Switch `typeVersion` vs parámetros v2
   - `node scripts/apply_claude_v2_patches.js` — aplica en JSON los FIX/mejoras del checklist v2 (WF-02…WF-07); el prompt largo está en `ai/Prompt AI Agent Inmobiliario.txt`
   - Diagnóstico: `_verificar_referencias.js`, `_diagnosticar_workflow_ids.js`, `_analizar_todos_workflows.js`, `_duplicados_por_nombre.js`
   - `.\scripts\_setup_ollama_completo.ps1` — Ollama + prompt + credencial + conexión al AI Agent en WF-02 (n8n cerrado al final)
   - `node scripts/_setup_ollama_n8n.js` — solo credencial Ollama + cable al AI Agent (n8n cerrado)
   - `.\scripts\Reemplazar Placeholders.ps1` — placeholders en archivos locales

## Carpetas

| Carpeta | Contenido |
|---------|-----------|
| `workflows/` | JSON de workflows n8n |
| `docs/` | Documentación |
| `scripts/` | Scripts de configuración |
| `config/` | Configuracion base, manifiesto |
| `ai/` | Prompt, esquema y payloads del AI Agent |
| `csv/` | CSV para Google Sheets |
