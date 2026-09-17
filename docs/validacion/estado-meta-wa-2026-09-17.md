# Estado guardado — Meta WhatsApp / stack (2026-09-17)

Retomar desde acá. **Secretos solo en `.env` local (no en este archivo).**

## Repo / chat
- Workspace: `D:\Dev\Nodo-Propiedades`
- Repo: https://github.com/AdrianFredess/Nodo-Propiedades (`main` @ `3e70655`)
- Chat Cursor Agent: «Nodo Matias tildes memoria rubro»

## `.env` (ya seteado localmente)
- `META_GRAPH_VERSION=v21.0`
- `META_PHONE_NUMBER_ID=1308134712383242`
- `META_WABA_ID=1058110703780226` (Cubika)
- `META_ACCESS_TOKEN` = System User BOT (seteado; no regenerar salvo que Adrian lo pida)
- Resto: Groq, n8n, Sheets, etc. según máquina

## Meta — hecho
- Business Suite: cartera **Nodo propiedades**
- WABA **Cubika** `1058110703780226` + WABA Test (no prod)
- Número: `+54 9 261 337-8581` — UI **Pendiente**
- System User **BOT** `61594083839775` con Página + App Nodo + WhatsApp Cubika
- Token generado y en `.env`
- Sitio negocio: `arqcubika.com.ar`
- No instalar WhatsApp/WA Business en ese chip (Cloud API)

## Meta — bloqueos al pausar
1. Display name «Nodo Propiedades» en WABA Cubika → GraphQL `1675034`. Dejar Cubika o WABA Nodo aparte.
2. 2FA login Facebook `+54 261 208-4544` (sin 9): no SMS; no cambia número; `developers.facebook.com` trabado. Business Suite sí entra.
3. Graph API con el token: `API access blocked` (OAuthException 200).
4. Número WA sigue Pendiente.
5. Webhook Meta → n8n (`…/webhook/meta-whatsapp`) **no** cerrado en esta sesión.
6. SIMPLE-02 **no** redeployado aún con estos `META_*` en n8n.

## Stack local (última vez que se levantó)
- n8n `2.12.3` → http://localhost:5678
- ngrok → https://deranged-defile-comrade.ngrok-free.dev
- ws-bridge → :3099
- front → :5173 (el proceso vite se abortó después; si hace falta: `cd front && pnpm --ignore-workspace run dev -- --host 127.0.0.1 --port 5173`)
- Webhook TG `@nodoprop_bot` apuntando a ngrok OK

Arranque: `ARRANQUE.bat` (o a mano si `timeout` falla en el agente).

## Bot código (ya en repo, no reabrir)
- Tildes chat casual + strip
- Memoria cliente-only
- Rubro sin inventar cifras
- Criterio 5 + cola tokens Groq TG

## Siguiente sesión (orden)
1. Estado del número `337-8581` (¿sigue Pendiente?).
2. Destrabar `API access blocked` sin regenerar token a menos que haga falta.
3. Webhook Meta → ngrok `/webhook/meta-whatsapp` + `META_VERIFY_TOKEN`.
4. Deploy SIMPLE-02 con `META_*`.
5. Mensaje de prueba.
6. Display name: Cubika por ahora.

## No commitear
- `.env`, tokens, logs `docs/validacion/_*.txt`
