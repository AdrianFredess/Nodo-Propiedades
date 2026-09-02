# Aprendizaje Matías — few-shot desde conversaciones reales

Sistema pragmático de mejora continua del asesor virtual **sin fine-tuning**: guarda pares consulta/respuesta útiles en Google Sheets e inyecta los últimos N como ejemplos en el prompt de Groq.

## 1. Crear la hoja

En el Google Sheet del proyecto (`GOOGLE_SHEET_ID` en `.env`):

1. Nueva pestaña: **`Aprendizaje_Matias`**
2. Fila 1 (A1:J1), headers:

```
fecha | canal | contexto_cliente | respuesta_matias | zona | operacion | presupuesto | temperatura | intencion | patron
```

Ver instrucciones detalladas:

```bash
node scripts/setup-aprendizaje-sheet.js
```

## 2. Desplegar nodos en n8n

```bash
# Actualiza workflows/*.json locales
npm run patch-advisor-learning

# Sube a n8n local (requiere N8N_API_KEY y n8n en :5678)
npm run patch-advisor-learning -- --deploy
```

Workflows afectados:

| Workflow | ID | Nodos nuevos |
|----------|-----|--------------|
| SIMPLE-02 WhatsApp | `npq6sC6YLaUBpHac` | Leer Aprendizaje Matias, IF Registrar Aprendizaje, Registrar Aprendizaje Matias |
| Bot Telegram | `8JoSfkcn3pE1f0av` | Leer Aprendizaje Matias TG, IF Registrar Aprendizaje TG, Registrar Aprendizaje Matias TG |

Messenger reutiliza los snippets WA vía `patch-messenger-matias.js` (few-shot en prompt); para registro automático en Sheets hay que correr también `patch-advisor-learning` o replicar los nodos.

## 3. Cómo funciona

### Lectura (few-shot)

Al armar el prompt (`wa-armar-prompt.js`, `tg-construir-prompt.js`):

1. **Por conversación:** `bot-aprendizaje.js` analiza `historial_json` y arma `contextoAprendizaje` (intención, zona, presupuesto, temas ya cubiertos, objeciones).
2. **Global:** selecciona 2–3 ejemplos de `data/bot-aprendizaje.json` según el mensaje actual.
3. **Sheets:** lee la hoja `Aprendizaje_Matias` (últimas ~6 filas) como pares Cliente/Matías.
4. Todo se inyecta en el prompt después del historial (complementa `humanize-voz` / `evitarRepeticion`).

### Registro automático

Al procesar la respuesta IA (`wa-procesar-ia.js`, `tg-parsear-respuesta.js`):

Se evalúa `debeRegistrarAprendizaje()`:

- Mensaje cliente ≥ 8 chars, respuesta ≥ 15 chars
- No `skip_reply`, no `respuesta_forzada`, no off-topic
- No saludo vacío (`ok`, `hola`, etc.)
- Dedup por `patron` + similitud de respuesta en `staticData` global
- Prioriza temperatura tibio/caliente, lead completo o cuando hay zona/presupuesto

Cada turno también guarda metadata en `historial_json` (`meta.intent_detected`, `meta.objeciones`, etc.).

Si pasa el filtro, `registrar_aprendizaje: true` y el nodo Sheets hace append.

## 4. Archivos clave

| Archivo | Rol |
|---------|-----|
| `scripts/snippets/intent-classifier.js` | Clasificación automática de intención (WA/TG) |
| `scripts/snippets/bot-aprendizaje.js` | Análisis de historial + few-shot + registro |
| `data/bot-aprendizaje.json` | Ejemplos globales seed (Mendoza) |
| `scripts/aggregate-bot-learning.js` | Import semi-auto desde CSV de Sheets |
| `scripts/patch-advisor-learning.js` | Parchea workflows + snippets |
| `scripts/setup-aprendizaje-sheet.js` | Guía de creación de hoja |

## 5. Mantenimiento

- Re-ejecutá `npm run patch-advisor-learning` después de cambiar snippets de prompt/procesamiento.
- Si corrés `patch-meta-whatsapp` o `patch-asesor-profesional`, esos scripts ya concatenan `bot-aprendizaje.js`.
- Para refrescar ejemplos globales: editá `data/bot-aprendizaje.json` o exportá Sheets y corré `npm run aggregate-bot-learning -- --input archivo.csv`, luego `npm run patch-advisor-learning`.
- Podés editar/borrar filas malas en Sheets; el bot usará las más recientes válidas.

## 6. Lenguaje informal (argentino)

Matías debe entender consultas **sin tildes ni formalidad** como consultas válidas de propiedades:

| Cliente dice | Significa | Matías NO debe |
|--------------|-----------|----------------|
| `que tenes por 50 mil` | Pedido de stock con presupuesto | Marcar off-topic |
| `cuanto sale un depto` | Consulta de precios/opciones | Responder con plantilla corporativa |
| `algo en godoy cruz` | Búsqueda por zona | Pedir compra/alquiler/venta en el primer mensaje |
| `mandame opciones` | Mostrar fichas del stock | Listar propiedades en texto largo |
| `esta muy caro` | Objeción de precio | Responder "Uf, no me cierra" |

Los ejemplos seed están en `data/bot-aprendizaje.json` (12 pares). El sistema selecciona 2–3 según tags (`informal`, `opciones`, `objecion_precio`, etc.) e los inyecta en el prompt.

**Audios:** si llega un audio sin transcripción, responde: *"Todavía no puedo escuchar audios, escribime por texto y te ayudo con propiedades"* (stub en `wa-normalizar-meta.js`).

## 7. Detección automática de intención

Desde 2026-09, Matías usa **`scripts/snippets/intent-classifier.js`**: capa JS ligera (sin segundo call a Groq) que combina presupuesto, zona, keywords inmobiliarios, historial y señales de curiosidad.

### Qué devuelve

```js
{
  intencion: 'pedir_opciones|explorar|consulta_zona|presupuesto|visita|saludo|off_topic|audio',
  confianza: 'alta|media|baja',
  mostrar_stock: boolean,
  modo_curioso: boolean,
  requiere_calificar: boolean  // true solo si ya mostró fichas y quiere refinar
}
```

### Defaults inteligentes

| Confianza | Comportamiento |
|-----------|----------------|
| **baja** | `mostrar_stock=true`, `modo_curioso=true`, `requiere_calificar=false` (beneficio de la duda) |
| **media/alta** | Reglas según señales concretas |

### Off-topic suavizado

- Solo off-topic **duro** para comida/restaurantes/personal claro.
- **Nunca** off-topic si `mostrar_stock=true`.
- Eliminada la regla frágil `(tenés && !INTENT)` como criterio único.

### Flujo

1. **Armar prompt:** `clasificarIntencionCliente()` → bloque `INTENCION_DETECTADA` inyectado en Groq.
2. **Procesar IA:** si el clasificador pidió stock y la IA solo preguntó → post-proceso fuerza fichas (`esSoloPreguntas`).
3. **Aprendizaje:** columna `patron` incluye tag de intención; few-shot global matchea por `tagAprendizajePorIntencion()`.

### Desplegar cambios

```bash
npm run patch-advisor-learning
npm run patch-advisor-learning -- --deploy
```

Orden de concatenación en snippets: `humanize-voz` → `intent-classifier` → `bot-aprendizaje` → prompt/proceso.
