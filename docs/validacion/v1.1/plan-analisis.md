**Plan de análisis v1.1 (registrado antes de la corrida).**
- **Pregunta:** ¿la clasificación del sistema completo v1.1 cumple CA3 (≥80% de coincidencia con la etiqueta del guion en los 30 mensajes)?
- **Métrica primaria:** aciertos/30 de `temperatura` final (`clasificacion_fuente = clasificador`; los `fallback` cuentan como intento y se reportan aparte), con IC de Wilson 95% y prueba binomial exacta unilateral contra 0,80.
- **Secundarias:**
  - McNemar exacto pareado contra 3f132c3 (16/30) y contra la prueba de componente (28/30);
  - matriz de confusión;
  - `t_hasta_respuesta_ms` (CA1: ≤8000 en ≥80%);
  - CA4 sobre los leads completos;
  - tokens.
- **Reglas:** una sola corrida, los mismos 30 mensajes del guion, sin cambiar prompts ni parámetros después de ver resultados. Toda fila se reporta. Si el criterio no se cumple, se informa así.
