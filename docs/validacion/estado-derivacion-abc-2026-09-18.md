# Spec implementada — Derivación A/B/C + config bot (2026-09-18)

## Qué quedó
1. **Clasificador A/B/C** en `intent-classifier.js` (`clasificarDerivacionHumano`) — determinístico.
2. **Paquete aviso vendedor** (`armarAvisoVendedorContexto`) → Telegram Owner (credencial n8n, sin placeholders) + `advisor.action`.
3. **Categoría C** fuerza mensaje corto de derivación y `bot_paused`.
4. **Categoría B** avisa sin cortar (salvo visita ya pausaba).
5. **Regla de oro:** el bot no dice "ya le aviso"; aviso Owner sin `parse_mode` (underscores rompían Markdown → 400).
6. **Panel** `/config` — tono, umbral, horario, mensaje derivación → `data/bot-config.json`.

## Owner Telegram (entrega real)
- `OWNER_TELEGRAM_CHAT_ID=1947576481` (`.env`, no commit)
- Nodo `Telegram Alerta Owner` = credential Telegram (mismo bot que Responder), no HTTP con token placeholder

## Retest live confirmado (2026-09-18T14:04Z)
Evidencia: `docs/validacion/derivacion-abc-live-2026-09-18T14-04-17-627Z.md`

| Cat | Cliente | Bot | Owner |
|-----|---------|-----|-------|
| A | que es una seña | sin alerta | sin envío ✓ |
| B | quiero agendar visita | link + "El asesor te confirma…" (sin "ya le aviso") | **message_id 323** |
| C | quiero hablar con una persona | "Te paso con Adrian, en un momento te escribe" (completo) | **message_id 324** |

Texto real entregado al chat del vendedor (API `ok` + `message_id` + body):

```
AVISO NODO - AVISO B / DERIVACION C
Cliente: Validacion
Canal: telegram
Motivo: visita | pide humano
…
Panel: http://localhost:5173/leads/telegram%3A999888801
```

## Pendiente menor
- Cat A aún puede responder "Ahi van estas" por bleed de stock en "seña" (no afecta derivación/entrega).
