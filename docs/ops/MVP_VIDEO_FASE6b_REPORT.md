# MVP Video — Fase 6b REPORT (catálogo + fotos demo)

Fecha: 2026-11-12 · Rama `mvp/video`

## 6b.1 — Propiedades del guion (STOP 3 aprobado)

| id | tipo | zona | operación | precio | detalle corto |
|---|---|---|---|---|---|
| MZA-031 | Casa 3 dorm. | Chacras de Coria | Venta | USD 139.000 | 180 m², pileta, galería |
| MZA-032 | Casa 3 dorm. | Chacras de Coria | Venta | USD 148.000 | 210 m², a estrenar |
| MZA-033 | Departamento 2 dorm. | Godoy Cruz | Venta | USD 84.000 | 68 m², Palmares |
| MZA-034 | Departamento 2 dorm. | Godoy Cruz | Venta | USD 89.500 | 74 m², apto crédito |

- Cargadas en stock Sheets (`Hoja 1`) y en `propiedadMedia.json`.
- **Match:** la hoja de stock solo tiene `id,tipo,zona,precio,descripcion,estado`. No hay columna `ambientes`; el tipo lleva “3 dorm.” / “2 dorm.” y la zona “Chacras de Coria” (matchea “chacras”). En media: `ambientes` 4 (casa) / 3 (depto 2 dorm.).
- MZA-016 sin cambios (queda fuera del presupuesto de Martín a propósito).

## 6b.2 — Fotos

- Carpeta: `D:\Dev\Nodo-Propiedades\demo-fotos\` (gitignore).
- Revisar: abrir `demo-fotos/indice.html` (5 props × 4 fotos).
- Créditos: `demo-fotos/CREDITOS.md`.
- `propiedadMedia.json` apunta a Unsplash `w=1280&h=800&fit=crop`.
- Prioridad video (031–034 + 016): sets únicos entre sí.
- Resto del catálogo con sets repetidos: listado en `docs/ops/pendientes.md` (Fase 6b).

## 6b.3 — linkFicha en el celular — STOP

- `panel_base_url` = `http://localhost:5173`.
- `NGROK_CATALOG_DOMAIN` vacío.
- **No se cambió el link** (el video se graba sin tocar ficha pública). Cuando haya ngrok/catálogo público, actualizar `panel_base_url` y re-correr `patch-mvp-06b-catalogo.js --deploy`.

## 6b.4 — Alertas dueño / una sola cuenta

- **En vivo (antes del patch):** todos los `Telegram Alerta *` tenían `__SET_OWNER_TELEGRAM_CHAT_ID__` → el 🔥 no llegaba.
- **Después del patch:** inyectado `OWNER_TELEGRAM_CHAT_ID=1947576481` (chat personal de Adrián) en 8 nodos de alerta.
- **Grupo “Ventas · Nodo Propiedades”:** todavía falta. Cómo sacar el id:
  1. Crear el grupo, agregar el bot.
  2. Mandar un mensaje en el grupo.
  3. `https://api.telegram.org/bot<TOKEN>/getUpdates` → `chat.id` negativo (ej. `-100…`).
  4. Poner ese id en `.env` como `OWNER_TELEGRAM_CHAT_ID` y correr `node scripts/patch-mvp-06b-catalogo.js --deploy`.
- `DEMO_CHAT_IDS` ahora incluye `1947576481` para que `pnpm demo:reset` limpie la cuenta de Adrián entre escenas.
- **Nombre del lead en el panel:** sale de `message.from.first_name` de Telegram (nodo Set del workflow). Cambiar el nombre de perfil entre escenas cambia el nombre en el pipeline.

## Patch

- `scripts/patch-mvp-06b-catalogo.js` (idempotente: 2.ª corrida `touched: []`).
- `PROP_MEDIA` fingerprint igual en Preparar Fotos / Construir Prompt / Parsear Respuesta / Parsear Respuesta Base / Override Fotos.
- Deploy a producción `8JoSfkcn3pE1f0av` OK.

## Checks pendientes (acción Adrián)

- [ ] Revisar `demo-fotos/indice.html`.
- [ ] Crear grupo Ventas y poner su `chat_id` en `.env`.
- [ ] Escenas Martín / Lucía por Telegram + `pnpm demo:reset`.
- [ ] Publicar front (ngrok) si se quieren links de ficha en el celular.
