# Configurar Google Sheets API (Nodo Propiedades)

Esta guía permite crear la planilla **Nodo Propiedades CRM** desde los CSV del proyecto y conectarla a n8n.

## Requisitos

- Node.js 18+ instalado
- Cuenta de Google
- Dependencias del proyecto: `npm install` en la raíz del repo

## 1. Proyecto en Google Cloud Console

1. Abrí [Google Cloud Console](https://console.cloud.google.com/).
2. Creá un **proyecto nuevo** (o elegí uno existente) y seleccionarlo en el selector superior.

## 2. Habilitar Google Sheets API

1. Menú **APIs y servicios** → **Biblioteca**.
2. Buscá **Google Sheets API**.
3. Pulsá **Habilitar**.

## 3. Pantalla de consentimiento OAuth

1. **APIs y servicios** → **Pantalla de consentimiento de OAuth**.
2. Tipo **Externo** (o Interno si es Workspace y solo usuarios del dominio).
3. Completá nombre de la app, email de soporte y dominios si te lo pide.
4. En **Ámbitos**, agregá: `https://www.googleapis.com/auth/spreadsheets` (o agregalo más adelante al crear el cliente).

## 4. Credenciales OAuth2 (aplicación de escritorio)

1. **APIs y servicios** → **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación de escritorio**.
3. Nombre: por ejemplo `Nodo Propiedades local`.
4. Creá el cliente y usá **Descargar JSON**.

## 5. URI de redireccionamiento (importante)

El script `_crear_google_sheet.js` usa este URI fijo:

```text
http://127.0.0.1:34567/oauth2callback
```

1. En **Credenciales**, abrí el cliente OAuth que creaste.
2. En **URI de redireccionamiento autorizados**, agregá exactamente la línea de arriba y guardá.

Si no agregás este URI, Google mostrará `redirect_uri_mismatch` al autorizar.

## 6. Guardar credenciales en el proyecto

1. Copiá el JSON descargado a:

   `config/google-credentials.json`

2. El contenido debe tener forma `installed` (client_id, client_secret, etc.), como en `config/google-credentials.example.json`.

**No subas este archivo a Git** (está en `.gitignore`).

## 7. Instalar dependencias

En la raíz del proyecto:

```bash
npm install
```

Necesitás al menos: `googleapis`, `csv-parse`. Si algo falla, reinstalá con:

```bash
npm install googleapis csv-parse better-sqlite3
```

## 8. Ejecutar el script (primera vez)

```bash
node scripts/_crear_google_sheet.js
```

- Se abrirá el navegador (o verás la URL en consola).
- Iniciá sesión con la cuenta que debe ser **propietaria** de la planilla.
- Aceptá los permisos de Google Sheets.
- Al volver a `127.0.0.1:34567`, el script guardará **`config/google-token.json`** automáticamente.

## 9. Resultado del script

Al terminar verás:

- **ID de la planilla** (cadena larga entre `/d/` y `/edit` en la URL).
- **URL** de la planilla.
- **Resumen de filas** por hoja (Leads, Propiedades, Interacciones, Seguimientos, Errores).

## 10. Actualizar n8n y los workflows con el nuevo ID

Copiá el ID que imprimió el script y ejecutá:

```bash
node scripts/_actualizar_sheet_id.js PEGÁ_AQUÍ_EL_ID_NUEVO
```

Esto:

- Reemplaza el ID antiguo en todos los `workflows/*.json`.
- Actualiza los workflows en la **base SQLite de n8n** (`~/.n8n/database.sqlite` en Windows: `C:\Users\<usuario>\.n8n\database.sqlite`).

Reiniciá n8n si estaba en ejecución para que cargue los cambios de la base.

## 11. Credencial de Google en n8n

En el editor de n8n, los nodos **Google Sheets** deben usar una **credencial OAuth2** de Google con el mismo proyecto y permisos de Sheets. El token del script (`google-token.json`) es para las herramientas locales; en n8n configurás la credencial desde la UI.

## Solución de problemas

| Error | Qué hacer |
|--------|-----------|
| `redirect_uri_mismatch` | Verificá que el URI `http://127.0.0.1:34567/oauth2callback` esté en la consola de Google. |
| `EADDRINUSE` | Otro proceso usa el puerto 34567; cerralo o cambiá el puerto en `_crear_google_sheet.js` y en la consola de Google. |
| Base de datos no actualizada | Cerrá n8n y volvé a ejecutar `_actualizar_sheet_id.js`, o importá de nuevo los JSON con `node scripts/_sync_importar_todos_workflows.js`. |
