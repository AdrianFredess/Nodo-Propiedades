# Stack Final Meta Produccion

## Usa este stack si vas 100% con Meta
Si tu canal principal es `Meta WhatsApp Cloud API`, este es el paquete final recomendado y mas simple de operar.

## Workflows que realmente necesitas
1. `WF-07 Error Logger.json`
2. `WF-06 Advisor Alert.json`
3. `WF-03 Property Matching.json`
4. `WF-04 Follow-up Orchestrator.json`
5. `WF-05 Daily Reactivation.json`
6. `WF-10 Meta Template Sender.json`
7. `WF-11 Meta Status Handler.json`
8. `WF-02 Core Lead Processor.json`
9. `WF-08 Manual Lead Tester.json`
10. `WF-09B Meta WhatsApp Cloud Webhook Produccion.json`

## Que puedes dejar fuera
No es obligatorio usar:
- `WF-00 Orquestador Principal Importable.json`
- `WF-01 Intake Multicanal.json`
- `WF-09 Meta WhatsApp Cloud Webhook.json`

Esos sirven si queres mantener arquitectura multicanal o una version mas simple del webhook.

## Ruta recomendada en produccion
1. El usuario escribe por WhatsApp.
2. Meta pega el evento en `WF-09B Meta WhatsApp Cloud Webhook Produccion.json`.
3. Si es mensaje entrante:
   - se normaliza,
   - va a `WF-02 Core Lead Processor.json`.
4. El core:
   - registra lead,
   - llama IA,
   - scorea,
   - responde,
   - agenda seguimiento,
   - alerta asesor si aplica.
5. Si Meta devuelve estados:
   - van a `WF-11 Meta Status Handler.json`.
6. Si queres escribir fuera de la ventana de 24 horas:
   - usas `WF-10 Meta Template Sender.json`.

## Orden de activacion
1. `WF-07`
2. `WF-06`
3. `WF-03`
4. `WF-04`
5. `WF-05`
6. `WF-10`
7. `WF-11`
8. `WF-02`
9. `WF-08`
10. `WF-09B`

## Endpoints importantes
### Verificacion e inbound Meta
- `/webhook/meta-whatsapp-prod`

### Test manual interno
- `WF-08 Manual Lead Tester.json`

## Regla comercial clave
Dentro de 24 horas desde el ultimo mensaje del usuario:
- podes usar texto libre.

Fuera de 24 horas:
- usa `WF-10 Meta Template Sender.json`.

## Minimo para que esto venda bien
- catalogo de propiedades bien cargado
- mensajes cortos
- asesor atendiendo calientes en menos de 10 minutos
- scoring revisado con casos reales
- seguimiento sin insistencia excesiva

## Recomendacion final
Si tu objetivo inmediato es vender y no experimentar, monta solo este stack Meta final y deja la version multicanal para una fase 2.
