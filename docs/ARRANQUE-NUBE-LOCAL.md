# Nube local — un solo arranque

```bat
D:\Dev\Nodo-Propiedades\ARRANQUE.bat
```

Hace:

1. `docker compose up -d` + espera health n8n  
2. ngrok al dominio fijo (si no está corriendo)  
3. `node scripts/set-telegram-webhook.js` → webhook TG al path del Bot  
4. Front en `http://127.0.0.1:5173`

| Qué | URL |
|-----|-----|
| Panel | http://localhost:5173 |
| n8n | http://localhost:5678 |
| Público (Telegram) | https://deranged-defile-comrade.ngrok-free.dev |

Front: `VITE_USE_MOCK=false`, poll 45s. PANEL-01 cachea payload 45s / stock 3 min.

## Políticas de pago

Ver `docs/POLITICAS-PAGO.md` y `csv/Politicas_Pago.csv`.

## FormSubmit (email lead caliente)

El nodo HTTP a formsubmit.co a veces requiere **activar el email** la primera vez (link en el correo). Si no llega mail, la alerta por Telegram owner sigue siendo la vía confiable (completar chat_id del owner en el workflow).
