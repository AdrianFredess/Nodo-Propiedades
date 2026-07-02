# Checklist Produccion

## Antes de activar
- `Google Sheets` creado y compartido con la credencial correcta
- Hojas `Leads`, `Propiedades`, `Seguimientos`, `Interacciones`, `Errores` listas
- CSVs importados
- Workflows importados en `n8n`
- Placeholders reemplazados
- Credenciales conectadas
- Prompt del AI Agent pegado
- Salida del agente validada contra `AI Output Schema.json`
- Catalogo con propiedades activas reales
- Asesor y telefono interno cargados

## Validacion tecnica
- Webhook `lead-intake` responde `accepted`
- Core processor guarda un lead nuevo
- Core processor registra una interaccion inbound
- AI Agent devuelve JSON parseable
- Se guarda score y temperatura
- Se envia respuesta por el canal correcto
- Se registra interaccion outbound
- Se crea seguimiento
- El seguimiento llama al workflow con `Wait`
- La alerta al asesor sale solo para `caliente` o aceptacion clara de avance
- El workflow de errores guarda fallos reales

## Validacion comercial
- Lead frio no llega al asesor
- Lead tibio recibe pedido concreto de datos
- Lead calificado recibe opciones o CTA
- Lead caliente dispara alerta inmediata
- No se contacta a leads con `do_not_contact`
- No se sigue insistiendo a leads con `visit_scheduled = true`

## SLA operativos
- Lead caliente: contacto humano en menos de 10 minutos
- Lead calificado con CTA: contacto humano en menos de 2 horas
- Primer mensaje automatico: menos de 1 minuto
- Revision de errores: 2 veces por dia

## KPI objetivo inicial
- primera respuesta < 1 minuto
- leads calificados > 20%
- contacto humano a calientes > 90% dentro del SLA
- visitas agendadas / leads calificados > 25%
- errores tecnicos criticos < 3% de ejecuciones

## Criterios de exito del sistema
- el asesor deja de perseguir curiosos
- sube la tasa de visitas reales
- el scoring coincide con el criterio comercial humano
- el seguimiento reactiva leads sin generar rechazo
- la informacion util del lead queda completa en CRM

## Alarmas que obligan a corregir
- muchos leads con score alto pero sin visita
- muchos mensajes automaticos sin respuesta
- propiedades sugeridas fuera de presupuesto
- duplicados frecuentes
- asesor sobrecargado por derivaciones tibias
