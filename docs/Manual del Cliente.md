# Nodo Propiedades — Manual del Cliente

## ¿Qué hace este sistema?

Tu sistema responde automáticamente a todos los leads que llegan por
WhatsApp, Messenger y Telegram, los califica con inteligencia artificial
y te avisa solo cuando hay alguien listo para comprar.

**Resultado:** Nunca más perdés un lead por no responder a tiempo.

---

## Cómo funciona (sin tecnicismos)

1. Un potencial comprador te escribe por WhatsApp (o Messenger o Telegram)
2. El sistema responde en menos de 1 minuto, de forma humana y natural
3. La IA analiza el mensaje y califica al lead (frío / tibio / calificado / caliente)
4. Si el lead está listo para comprar, **te avisa por WhatsApp inmediatamente**
5. Si no está listo, el sistema le hace seguimiento automático a las 24hs, 3 días y más

Todo queda registrado en tu planilla de Google Sheets.

---

## Tu planilla de Google Sheets

Abrí la planilla "Nodo Propiedades CRM" para ver todo en tiempo real.

### Hoja Leads
Todos tus contactos con su información y estado actual.

Columnas importantes:
- **temperature**: frio / tibio / calificado / caliente
- **current_score**: puntaje del 0 al 100 (mayor = más listo para comprar)
- **status**: abierto / descartado / cerrado
- **advisor_notified**: si ya te avisaron de este lead
- **do_not_contact**: si el lead pidió no ser contactado

### Hoja Interacciones
Historial completo de todos los mensajes enviados y recibidos.

### Hoja Seguimientos
Los follow-ups programados. Si ves "pending", están esperando ser enviados.

### Hoja Errores
Si algo falla, queda registrado acá. Revisala 2 veces por semana.

### Hoja Propiedades
Tu catálogo de propiedades disponibles. Mantenerlo actualizado es clave
para que el sistema sugiera las opciones correctas.

---

## Cómo mantener el catálogo de propiedades

Para agregar una propiedad nueva:
1. Abrí la hoja "Propiedades" en Google Sheets
2. Agregá una fila nueva con todos los datos
3. El campo **status** debe ser "activo" para que el sistema la sugiera
4. Para pausar una propiedad, cambiá status a "inactivo"

Campos más importantes:
- **zone**: la zona exacta (ej: "Caballito", "Palermo")
- **price**: precio en números (sin puntos ni comas, ej: 125000)
- **currency**: USD o ARS
- **payment_options**: contado, credito_preaprobado, anticipo_y_credito

---

## Qué hacer cuando te llega una alerta

Cuando el sistema te avisa por WhatsApp de un lead caliente, el mensaje incluye:
- Nombre del lead
- Teléfono
- Score y temperatura
- Zona y presupuesto
- Resumen de la IA

**Tiempo de respuesta recomendado:** menos de 10 minutos para leads calientes.

---

## Métricas diarias

Cada mañana a las 8am recibís un resumen por WhatsApp con:
- Leads nuevos del día anterior
- Cuántos están fríos / tibios / calificados / calientes
- Score promedio
- Si hay errores técnicos para revisar

---

## Preguntas frecuentes

**¿Qué pasa si el sistema no responde?**
Revisá la hoja Errores. Si hay entradas recientes, contactá al soporte.

**¿Puedo editar los mensajes automáticos que manda el sistema?**
Sí, contactá al soporte para personalizar los mensajes según tu negocio.

**¿El sistema puede manejar respuestas del lead?**
El sistema responde el primer mensaje y hace follow-ups. Para conversaciones
más largas, el asesor toma el control cuando el lead está calificado.

**¿Qué pasa si un lead pide no ser contactado?**
El sistema lo detecta automáticamente y marca "do_not_contact = true".
Ese lead no recibe más mensajes.

**¿Cómo agrego un nuevo canal (Instagram, portal inmobiliario)?**
Contactá al soporte para configurarlo.

---

## Contacto de soporte

[TU NOMBRE]
[TU EMAIL]
[TU TELÉFONO]
