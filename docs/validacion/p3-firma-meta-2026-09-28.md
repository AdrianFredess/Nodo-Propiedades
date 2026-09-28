# P3 — Firma HMAC Meta

- Workflow de prueba `xvKMOuZfq0EDdSfi`, mismo código que `Validar Firma Meta` en SIMPLE-02 y SIMPLE-03.
- POST con firma inválida: HTTP **401**.
- POST con firma válida: HTTP **200**.
- Ejecución 13751 (firma inválida): nodo de firma sí, HTTP Groq no.
- Ejecución 13752 (firma válida): nodo de firma sí, HTTP Groq sí.
- `META_APP_SECRET` en `.env` es un placeholder local. Hay que reemplazarlo por el App Secret de Meta; si no, los POST reales de WhatsApp y Messenger responden 401.
