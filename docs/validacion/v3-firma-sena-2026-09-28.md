# V3 — Firma sobre los bytes de Meta, con acento

- Workflow de prueba `rcJrn4MT3FTinl5J`. Si no hay binary, rechaza: no re-serializa el JSON.
- POST con firma inválida: HTTP **401**.
- POST con firma válida: HTTP **200**.
- POST `{"text":"seña"}` firmado sobre esos bytes: HTTP **200**.
- Ejecuciones: 13879 groq=true fuente=binary ok=true ; 13878 groq=true fuente=binary ok=true ; 13876 groq=false fuente=binary ok=false
