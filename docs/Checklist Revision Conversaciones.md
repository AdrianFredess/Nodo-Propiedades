# Checklist — Revisión humana (Conversaciones_Revision)

## Objetivo
Verificar que el nodo `Construir Prompt` (WA + TG) cumple el tono humanizado, que la detección determinística de repetición funciona y que el sistema registra en Google Sheets cuando:
- se detecta repetición (motivo `REPETICION`)
- la conversación supera el umbral de turnos sin clasificar el lead (motivo `SIN_CLASIFICAR`)

## Antes de probar
- Pestaña `Conversaciones_Revision` creada (ver `scripts/setup-conversaciones-revision-sheet.js`).
- Google Sheets credencial configurada en n8n.

## Casos de prueba (8-10)
1. **Repetición exacta (WA):** enviar “qué tenés por 50 mil usd” y repetirlo literal 1 turno después.  
   Validar: respuesta reformulada (no igual), y se agrega fila con `motivo=REPETICION`.

2. **Repetición con variación de puntuación (WA):** “que tenés 50 mil usd” vs “que tenes 50.000 USD!!”.  
   Validar: también se detecta repetición y se reformula.

3. **Repetición vs stock/IDs (TG):** pedir opciones dos veces (“qué hay?”) de forma similar.  
   Validar: se vuelven a mostrar fichas si corresponde, pero el texto visible no se repite tal cual.

4. **Grosero (WA/TG):** enviar una consulta con tono agresivo (sin insultos extremos si no querés).  
   Validar: el bot no responde defensivo, mantiene tono profesional y trata de entender.

5. **Curioso sin intención real (WA/TG):** “solo estoy viendo” / “ando curioseando”.  
   Validar: muestra 2-3 opciones o rangos si aplica, y hace una sola pregunta suave (sin cuestionario).

6. **Ambiguo (WA/TG):** “algo en Mendoza” sin más contexto.  
   Validar: pregunta SOLO una cosa concreta (operación o zona o presupuesto), nunca lista.

7. **Señales “modo soporte técnico” (WA/TG):** probar con “Entiendo tu consulta…” (o pedir explícitamente respuestas formales).  
   Validar: el bot no usa ese estilo y mantiene voz humana.

8. **2 bloques por doble salto de línea (WA/TG):** pedir una consulta que probablemente genere más de 3 oraciones (ej. “pasame opciones y después decime rangos y si es compra o alquiler”).  
   Validar: se envía como 2 mensajes separados (bloque principal + bloque extra), sin mostrar tags.

9. **Sin clasificar (TG):** mantener una conversación “larga” (>= umbral) sin dar datos completos hasta que el modelo no marque `lead_completo`.  
   Validar: se agrega fila con `motivo=SIN_CLASIFICAR`.

10. **Sin clasificar (WA):** repetir el caso anterior en WhatsApp (usando `consultas_count` como proxy de turnos).  
   Validar: fila con `motivo=SIN_CLASIFICAR`.

## Checklist de integridad
- En Telegram, el output del LLM sigue incluyendo:
  - `###ESTADO_ACTUAL:frio|tibio|caliente###`
  - `###LEAD_COMPLETO### ... ###FIN_LEAD###`
- `evitarRepeticion` / stock / tags `###MOSTRAR_PROPIEDADES###` no se rompen.

