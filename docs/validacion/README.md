# Validación ampliada — protocolo y resultados crudos

## Objetivo
Ampliar la muestra del capítulo 5 **sin pseudorreplicación**, registrando cada ejecución en filas crudas (sin promedios).

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `guion_conversaciones_perfil.csv` | **30 mensajes distintos**: 10 caliente + 10 tibio + 10 frío (redacciones diferentes) |
| `resultados_F3_mitigado_crudo.csv` | **20 ejecuciones F3** sobre el parser mitigado (puerto Python del `Parsear Respuesta` de n8n). Cada fila = un input malformado |
| `resultados_clasificacion_PENDIENTE.csv` | Plantilla de 30 filas del guion, columnas de result vacías. Completar con bot real o Groq |
| `resultados_clasificacion_crudo.csv` | Campaña ampliada: 30 ejecuciones reales (Groq API / bot) |
| `comparacion_simple01_vs_ia_crudo.csv` | Comparación SIMPLE-01 (keywords) vs clasificador IA sobre las mismas 30 filas del guion |

## Cómo ejecutar la clasificación “contra el bot real”

### Opción A — Telegram manual (máxima validez de tesis)
1. n8n con **Bot Telegram Inmobiliaria** activo.
2. Por cada fila del guion: chateá el `mensaje_usuario` con un chat_id de prueba (podés usar chats distintos o /start y cambiar nombre).
3. Anotá a mano en `resultados_clasificacion_crudo.csv`:
   - temperatura del Sync/Guardar Lead o del bloque LEAD
   - tiempo (relómetro desde envío hasta respuesta en Telegram)
   - si hubo JSON parseable (`lead_completo` true/false en ejecución n8n)

### Opción B — Groq API batch (misma lógica de modelo + parser mitigado)
```powershell
$env:GROQ_API_KEY = "tu-clave"
py -3 D:\DevCaches\Temp\build_tesis_artifacts.py
```
Genera `resultados_clasificacion_crudo.csv` con 30 ejecuciones reales al modelo `llama-3.3-70b-versatile`.

### F3
Ya corrido sobre la versión mitigada (`lead_completo=false` si el JSON del bloque falla; el flujo no aborta). Ver `resultados_F3_mitigado_crudo.csv`.

## Columnas de la planilla de clasificación
`id, perfil_esperado, mensaje_usuario, clasificacion_obtenida, coincide, json_parseo_ok, lead_completo, tiempo_ms, respuesta_preview, timestamp_utc, modo_ejecucion, notas`

No promediar acá: los IC los calcula el autor de la tesis sobre estas filas.
