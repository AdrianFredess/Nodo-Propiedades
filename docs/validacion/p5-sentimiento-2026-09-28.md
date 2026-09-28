# P5 — Derivación por sentimiento

- `clasificarDerivacionHumano` ya no trata mayúsculas ni `!!!` como frustración.
- Insulto claro (`chantas`, y la lista que ya estaba) sigue en clase C.
- Queja leve y sarcasmo ambiguo quedan en A.
- El texto al cliente en C es `mensajeDerivacionCliente`: `Te paso con Adrian, en un momento te escribe.` No lo redacta el modelo. `sheets_error` no lo pisa.
- `node scripts/test-sentimiento.js` leyó los casos S de `scripts/eval/casos-matias.v1.json`: S1 es C, S2 no es C.
- Desplegado en el bot de Telegram `8JoSfkcn3pE1f0av` y en SIMPLE-02 `npq6sC6YLaUBpHac` (2 nodos cada uno).
