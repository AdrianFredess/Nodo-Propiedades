# Auditoría del sistema — qué se revisó y qué debés hacer vos

## Correcciones aplicadas en el proyecto

### 1. Deduplicación de leads (WF-02)
**Problema:** En Messenger y Telegram no hay `phone` ni `email`; el `dedupe_key` caía en `anonymous:${Date.now()}` y **cada mensaje creaba un lead nuevo**.

**Solución:** Si no hay teléfono ni email, se usa `source:channel_reply_target` (ej. `telegram:123456789`).

### 2. Script `_verificar_referencias.js`
**Problema:** El regex extraía mal el ID (tomaba `"workflowId"` en lugar del valor).

**Solución:** Parser corregido; detecta placeholders `__SET_*__` y duplicados por nombre.

### 3. Script `_actualizar_ids_importados.js`
**Problema:** Con varios workflows que coincidían con "WF-02", el último ganaba y podías enlazar al Core equivocado. Si hay **dos filas con el mismo nombre** (reimportación), SQLite devolvía cualquiera.

**Solución:** Resolución por **nombre exacto** y, si hay duplicados, **`ORDER BY updatedAt DESC`** (se usa siempre el workflow más reciente). El prompt del AI Agent se actualiza **solo en ese** registro.

### 4. Documentación `LEER PRIMERO`
- Orden claro: importar → `_actualizar_ids_importados.js` → verificar → placeholders → pruebas.
- Nota sobre WF-08 y canal de respuesta.

### 5. Script `_post_import.js`
Ejecuta en cadena: actualizar IDs, corregir referencias rotas y verificar.

```bash
node scripts/_post_import.js
```

---

## Lo que tenés que revisar manualmente en n8n

| Item | Acción |
|------|--------|
| **Workflows duplicados** | Ejecutá `node scripts/_eliminar_duplicados_workflows.js` (con n8n detenido): deja el mas reciente por nombre y borra el viejo. Luego `node scripts/_actualizar_ids_importados.js`. |
| **Placeholders en JSON** | Los archivos en `workflows/` siguen con `__SET_*__` hasta que corras `Reemplazar Placeholders.ps1` o edites en la UI. La **base de datos** se arregla con `_actualizar_ids_importados.js`. |
| **Credenciales** | Google Sheets, Meta, Ollama, Telegram: todas en n8n. |
| **AI Agent** | Modelo Ollama (u otro) conectado al nodo en WF-02. |
| **Messenger + una sola URL** | Meta exige **una** URL de webhook. En n8n tenés GET y POST en nodos distintos: copiá las URLs de producción de ambos nodos; si Meta solo acepta una, usá la que coincida con tu despliegue o un proxy que unifique GET/POST. |

---

## Lista de workflows esperados (15)

WF-00, 01, 02, 03, 04, 05, 06, 07, 08, 09, 09B, 10, 11, **12**, **13**.

---

## Comandos rápidos

```bash
node scripts/_post_import.js
node scripts/_eliminar_duplicados_workflows.js
node scripts/_diagnosticar_workflow_ids.js
```
