# Campaña tesis — bot evaluado `3f132c3`

Repite los 30 mensajes de `docs/validacion/guion_conversaciones_perfil.csv` por una **copia** del workflow del tag `tesis-evaluacion-3f132c3`, con stock real, escritura en planillas de prueba y tiempos por ejecución.

## Scripts

| Script | Qué hace |
|---|---|
| `node scripts/tesis/build-copia-3f132c3.js` | Arma `workflows/tesis/TESIS-3f132c3-campana.json` + `integridad-generada.md` |
| `node scripts/tesis/run-campana-flujo-3f132c3.js --smoke\|--run\|--resume\|--dry-run` | Smoke / corrida / reanudación / dry-run |
| `node scripts/tesis/test-campana-3f132c3.js` | Tests sin red |

Variables en `.env`: `N8N_BASE_URL`, `N8N_API_KEY`, `WORKFLOW_ID`.

## Fase 1 — Precondiciones

1. n8n arriba: `http://localhost:5678/healthz` (o `ARRANQUE.bat` / `docker compose up -d`).
2. Credencial Google Sheets reconectada. Si `invalid_grant` o stock 0 → STOP.
3. Copiá en Drive las 3 planillas, vaciá datos (dejá encabezados) y completá `planillas-prueba.json`:
   - `historial` ← copia de `1r7EIzgF8vB3PdS2__m3qC-eSB2W9b4rC4v8Ajs8iAoo`
   - `guardar_lead` ← copia de `18eZ-ryGdRC4jVbzfd11ttITl3VwuW00HPxbAzU0LimQ` (verificar pestaña `Sheet1` + columna `chat_id`)
   - `leads_bot_consultas` ← copia de `1-0IBpaUl3svRmzMqNK0NYZYbuUDxCytnBd5Ql2DcOjo` (vaciar `Leads_Bot` y `Consultas`)
4. Pausar producción `8JoSfkcn3pE1f0av` con OK explícito (Groq ~160k tokens ese día).

## Fase 2 — Copia y smoke

```bat
node scripts/tesis/build-copia-3f132c3.js
REM importar workflows/tesis/TESIS-3f132c3-campana.json por API, activar, setear WORKFLOW_ID
node scripts/tesis/run-campana-flujo-3f132c3.js --smoke
```

Si `stock_leido=0` o error en Guardar Lead / Actualizar Historial / Sync Leads_Bot → parar.

## Fase 3 — Corrida

```bat
node scripts/tesis/run-campana-flujo-3f132c3.js --run
```

Ritmo ≥ 75 s + gobernador TPM/TPD (usa `tokens` reales de Groq). Ante 429 diario: `--resume` otro día.

## Fase 4 — Cierre

1. Exportar CSV de las 4 hojas de prueba.
2. Desactivar la copia.
3. Reactivar producción y verificar hash de nodos+conexiones.
4. Commit del día en `tesis/campana-3f132c3` (sin merge).

## Entregables

`docs/validacion/campana-flujo-3f132c3-<AAAA-MM-DD>/`: `resultados.csv`, `transcripcion.md`, `integridad.md`, `stock_snapshot.csv`, exports de hojas.
