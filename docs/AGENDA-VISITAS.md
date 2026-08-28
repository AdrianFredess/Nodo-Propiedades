# Agenda de visitas (Sheets + n8n)

## Idea

Tu agenda vive en la hoja **`Agenda_Visitas`** del mismo spreadsheet de leads.

| Columna | Uso |
|---------|-----|
| `slot_id` | ID único (ej. `S-2026-09-01-09`) |
| `fecha` / `hora` | Turno |
| `estado` | `libre` → `a_confirmar` → `confirmado` (o volver a `libre`) |
| `chat_id`, `nombre`, `telefono`… | Datos del cliente cuando pide el turno |

## Flujo

1. Cliente pide visita en el chat.
2. El bot manda el link del form (turnos **libres** solamente).
3. Cliente elige un slot → queda **`a_confirmar`**.
4. Te llega mail a Gmail con todos los datos.
5. Vos confirmás en la planilla (`confirmado`) o liberás el slot.

Si alguien pide un viernes 9:00 que ya está `a_confirmar`/`confirmado`, el form **no lo ofrece** (o rechaza al enviar).

## Form público

`https://deranged-defile-comrade.ngrok-free.dev/webhook/cita-form`

## Seed demo

```bash
node scripts/run-seed-agenda.js
```

(Crea la hoja si falta y carga turnos de ejemplo desde `csv/Agenda_Visitas.csv`.)

## Google Form (alternativa)

Si preferís un Google Form clásico: crealo, activá notificaciones a tu Gmail, y pegá la URL en el prompt del bot.  
La agenda en Sheets es mejor para **no pisar horarios**.
