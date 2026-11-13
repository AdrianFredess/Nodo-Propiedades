# MVP Video — Fase 7 REPORT

Fecha: 2026-11-12 · Rama `mvp/video`

## 7.1 Humanize
- `scripts/lib/humanize-reply.js` + tests (verde).
- Inyectado en `Parsear Respuesta Base` (y snippet).
- `Telegram Responder` **sin** `parse_mode` → OK sacar markdown de chat. Las fotos siguen con HTML aparte.

## 7.2 CÓMO ESCRIBÍS
- Bloque agregado en `Construir Prompt` (antes de FRASES PROHIBIDAS).
- `inmobiliaria_nombre` desde config; fallback "la inmobiliaria".
- Largo jsCode Construir Prompt ≈ 200.518 chars (post-patch). No se tocó el clasificador.

## 7.3 Typing
- Nodo `Mostrar escribiendo` (Telegram `sendChatAction`) antes de `HTTP Groq`, `onError: continueRegularOutput`.
- `Mostrar escribiendo parte` entre partes.

## 7.4 Partir respuesta
- `scripts/lib/split-reply.js` + tests.
- Cadena: `Partir Respuesta` → `Loop Partes Respuesta` → `Wait` → typing → `Telegram Responder` → loop; al terminar → `Preparar Fotos`.
- No parte si hay `photo_ids` o `mandar_en_partes=false` o `/start`.
- Historial sigue guardando el texto completo en Parsear (antes del split).

## 7.5 Resumen ficha
- `buildLeadResumenLine` en panel (`LeadDetailPage`), arriba del nombre.

## 7.6 Profesional
1. `scripts/telegram-perfil.js`: name / short / description OK (token desde credencial n8n). Foto: BotFather `/setuserpic` (manual).
2. `/start` → texto fijo sin Groq (`IF Es Start` → `Respuesta Start Fija`).
3. Panel: marca desde config, textos menos técnicos (Polling→Actualización periódica, etc.), resumen en ficha.
4. Fotos: Unsplash de 6b.2 aprobado. Props del guion con 4 fotos. Resto duplicado listado en `pendientes.md`.
5. Login: **no existe** → anotado en `pendientes.md` (no se construyó).

## Tests
```
node --test scripts/lib/*.test.js  → 20 pass
pnpm --filter/front build          → verde
check-secrets                      → 0 hallazgos
patch-mvp-07-humanize.js 2×       → idempotent: true
```

## STOP / acción Adrián
- Grupo Telegram "Ventas" + `OWNER_TELEGRAM_CHAT_ID` negativo.
- Foto del bot en BotFather (`/setuserpic`).
- Revisar `demo-fotos/indice.html`.
- Probar las 3 conversaciones del guion (Lucía, Martín, contraoferta) y “sos un bot?”.
- `pnpm demo:reset` entre escenas.

## Textos UI cambiados
- `Polling` → `Actualización periódica`; `Sin WS` → `Sin conexión en vivo`; `Conectado` → `En vivo`
- Error `/probar`: sin mencionar n8n
- Config restore / mock: sin jerga de patch/n8n
- Hoy: nombre fallback `Cliente` (no `chatId`)
