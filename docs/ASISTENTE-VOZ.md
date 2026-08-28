# Asistente de voz — Panel Nodo Propiedades

Botón flotante con ícono ✦ en el panel: comandos por voz o texto, navegación instantánea y respuestas habladas.

## Requisitos

- **Navegador:** Chrome o Edge (Web Speech API para reconocimiento).
- **Micrófono:** permiso del navegador al primer uso.
- **HTTPS o localhost:** el micrófono no funciona en HTTP remoto sin certificado.

## Comandos soportados

| Decís o escribís | Acción |
|------------------|--------|
| «mostrá el catálogo» / «propiedades» | Va a `/catalogo` |
| «pipeline» / «leads» | Va a `/pipeline` |
| «resumen» / «inicio» | Va al dashboard |
| «resumen de ayer» | Métricas del día anterior + leads urgentes |
| «resumen de hoy» | Actividad del día |
| «a quién le tengo que hablar» | Calientes pendientes de seguimiento |
| «abrí el lead de Carla» | Abre ficha por nombre (match parcial) |

## Configuración (`front/.env`)

```env
# off | edge | browser | elevenlabs
# edge = voz argentina real (Tomás, vía ws-bridge) — recomendado
VITE_TTS_MODE=edge
VITE_TTS_URL=http://127.0.0.1:3099/tts

# Solo si querés voz clonada (tu voz)
VITE_ELEVENLABS_API_KEY=
VITE_ELEVENLABS_VOICE_ID=
```

### Voz argentina real — Edge TTS (recomendado)

El panel usa el **ws-bridge** (`POST /tts`) con la voz neural **es-AR-TomasNeural** de Microsoft. Suena argentino de verdad, sin depender de voces instaladas en Windows.

1. Levantá el bridge: `cd ws-bridge && pnpm start` (puerto 3099)
2. En `front/.env`: `VITE_TTS_MODE=edge` y `VITE_TTS_URL=http://127.0.0.1:3099/tts`
3. Reiniciá `pnpm dev` — en el pie del Asistente debería decir **Tomás — argentino (Edge TTS)**

Voz alternativa en el bridge: variable `TTS_VOICE=es-AR-ElenaNeural` (femenina).

### Voz del navegador (fallback)

Sin costo, pero **solo si tenés es-AR instalada**. Si no, el navegador usa una voz inglesa con acento forzado — evitalo.

**Windows / Edge:**
1. Configuración → Hora e idioma → Voz → Agregar voces
2. Instalá **Español (Argentina)** → voz **Pablo** (masculina)
3. En `front/.env`: `VITE_TTS_MODE=browser` y `VITE_TTS_VOICE_HINT=pablo`

### Voz clonada (ElevenLabs) — sonar como vos

1. Creá cuenta en [elevenlabs.io](https://elevenlabs.io).
2. **Voice Lab → Add Generative or Cloned Voice → Instant Voice Cloning.**
3. Subí 1–3 minutos de audio tuyo hablando natural (sin música de fondo).
4. Copiá el **Voice ID** de la voz creada.
5. En [API Keys](https://elevenlabs.io/app/settings/api-keys) generá una key.
6. En `front/.env`:
   ```env
   VITE_TTS_MODE=elevenlabs
   VITE_ELEVENLABS_API_KEY=sk_...
   VITE_ELEVENLABS_VOICE_ID=...
   ```
7. Reiniciá `pnpm dev` en `front/`.

> **Seguridad:** la API key queda en el bundle del front (solo desarrollo/demo). En producción conviene un proxy en n8n (workflow PANEL-06 futuro) para no exponer la key.

## Limitaciones

- **No entrena un modelo propio:** el tono escrito viene de reglas locales; la voz clonada solo afecta el audio (TTS).
- **Reconocimiento:** depende del motor del navegador; acentos argentinos funcionan mejor con `es-AR`.
- **Firefox/Safari:** reconocimiento de voz limitado o ausente; usar Chrome/Edge.

## Tests

```bash
cd front
pnpm test
```

## Conexión en vivo y contexto offline

El Asistente **no depende solo del WebSocket**. Si todo estuvo apagado:

1. Al **abrir el panel** lee el historial de Telegram/WhatsApp desde Sheets.
2. **Refresca datos** automáticamente y arma un resumen de lo que pasó desde la última vez.
3. Si hubo mensajes o leads urgentes, te **habla el briefing** al abrir (o decí «poneme al día»).

La actividad se guarda en el navegador para no perder contexto entre sesiones.

## Conexión en vivo (Telegram / WhatsApp)

El Asistente escucha el mismo **WebSocket** que el panel (`VITE_WS_URL`).

- Punto verde en el botón ◆ = conectado en vivo
- Toggle **Avisos Telegram**: cuando el Asistente está abierto, te habla al entrar un mensaje de cliente
- Comandos: «¿qué pasó en Telegram?», «último mensaje»

Cada respuesta a Groq incluye contexto de actividad reciente de canales.

Con `VITE_ASSISTANT_HUMANIZE=true` (default), cada respuesta pasa por **PANEL-06** en n8n + Groq antes de mostrarse y hablarse.

El estilo se basa en muestras anonimizadas de tu Instagram (`styleSamples.json`) y reglas de castellano argentino criollo, educado y profesional.

**Comandos nuevos:** «¿cómo estamos?», «ayuda», «cuántos leads tenemos».

### Activar PANEL-06

1. Importá `workflows/PANEL-06 Panel Assistant.json` en n8n
2. Asigná credencial **Groq API** (misma que el bot Telegram)
3. Activá el workflow
4. En `front/.env`:
   ```env
   VITE_ASSISTANT_HUMANIZE=true
   VITE_ASSISTANT_API_URL=http://localhost:5678/webhook/panel-assistant
   ```

### Regenerar muestras desde Instagram

```bash
node scripts/extract-instagram-style.js "ruta/al/export"
```

Luego revisá y curá `front/src/features/assistant/styleSamples.json` (solo estilo anonimizado; el export crudo no se sube a git).


```
Micrófono → Web Speech API (STT)
         → localIntents.ts (intents en español)
         → buildReply.ts (respuesta + datos de leads)
         → TTS (Edge argentino, navegador o ElevenLabs)
         → react-router (navegación)
```
