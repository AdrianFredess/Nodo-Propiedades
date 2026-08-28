# Seguimiento automático (SIMPLE-04)

## Idea de negocio (cómo lo haría un asesor real)

1. Cliente deja de responder.
2. Esperás **~4–5 días** y mandás un mensaje suave (“¿seguís con ganas…?”).
3. Si no responde, esperás **~10 días más** y cerrás con un mensaje corto sin presión.
4. Si el cliente escribe en cualquier momento → el bot marca `estado_seguimiento=respondido` y **no** se lo vuelve a molestar.

Eso evita quedar “pesado” y perder leads por intensidad.

## Modo DEMO (tesis / defensa)

En local/tesis los tiempos están **comprimidos** para poder mostrar el flujo en minutos:

| Paso | Demo | Real (`SEGUIMIENTO_MODE=prod`) |
|------|------|--------------------------------|
| 1.er follow-up | ~20 min sin respuesta | ~5 días |
| 2.º follow-up | ~20 min después del 1.º | ~10 días después del 1.º |

Config en `.env` / Docker:

```env
SEGUIMIENTO_MODE=demo
# SEGUIMIENTO_MODE=prod
```

## Pausar a mano

En el panel solo hace falta **Pausar recordatorios** (estado `cerrado`).  
“Ya respondió” lo detecta el bot solo cuando el cliente escribe.

## Mensajes

Cortos, humanos, sin presión. El 2.º mensaje cierra amable (“te dejo por acá…”).
