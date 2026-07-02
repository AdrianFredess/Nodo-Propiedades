# Meta Ventana 24h y Templates

## Regla operativa clave
En `Meta WhatsApp Cloud API` hay dos escenarios:

### 1. El cliente te escribio dentro de las ultimas 24 horas
Puedes responder con:
- texto libre
- mensajes normales desde:
  - `WF-02 Core Lead Processor.json`
  - `WF-04 Follow-up Orchestrator.json`
  - `WF-06 Advisor Alert.json`

### 2. Pasaron mas de 24 horas desde el ultimo mensaje del cliente
No conviene intentar texto libre.
Debes usar plantilla aprobada con:
- `WF-10 Meta Template Sender.json`

## Cuando usar template sender
Usalo para:
- reactivacion de leads antiguos
- recordatorios tardios
- recontacto fuera de ventana
- campañas de recuperacion

## Ejemplo de uso
Entrada al workflow `WF-10 Meta Template Sender.json`:
```json
{
  "lead_id": "ld_123",
  "to": "5491100000000",
  "template_name": "seguimiento_propiedades",
  "language_code": "es_AR",
  "template_variables": [
    "Juan",
    "Caballito",
    "esta semana"
  ]
}
```

## Recomendacion comercial
No llenes de templates el embudo.
Usalos solo cuando:
- el lead mostro interes real,
- el tiempo paso,
- y queres retomar sin violar la politica de Meta.

## Sugerencia de templates a aprobar
- `seguimiento_propiedades`
- `reactivacion_busqueda`
- `confirmacion_visita`
- `asesor_te_contacta`

## Riesgo real
Si intentas mandar texto libre fuera de ventana:
- Meta puede rechazar el mensaje
- baja la confiabilidad del sistema
- afecta la continuidad del seguimiento

## Regla simple para operar
- dentro de 24h: flujo normal
- fuera de 24h: `WF-10 Meta Template Sender.json`
