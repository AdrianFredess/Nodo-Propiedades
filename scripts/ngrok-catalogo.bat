@echo off
REM Túnel ngrok para el catálogo público (puerto 5173).
REM Requiere un segundo dominio reservado en ngrok (plan free: 1 dominio → solo n8n).
cd /d D:\Dev\Nodo-Propiedades

if "%NGROK_CATALOG_DOMAIN%"=="" (
  echo NGROK_CATALOG_DOMAIN no definido.
  echo.
  echo Opcion A — variable de entorno de Windows:
  echo   setx NGROK_CATALOG_DOMAIN tu-dominio-catalogo.ngrok-free.dev
  echo.
  echo Opcion B — en .env del repo:
  echo   NGROK_CATALOG_DOMAIN=tu-dominio-catalogo.ngrok-free.dev
  echo.
  echo Luego regenerá links de ficha:
  echo   set CATALOG_PUBLIC_BASE_URL=https://%%NGROK_CATALOG_DOMAIN%%/catalogo
  echo   node scripts/generate-propiedad-media.js
  echo   node scripts/patch-asesor-profesional.js
  exit /b 1
)

echo Iniciando ngrok catalogo -^> :5173 (%NGROK_CATALOG_DOMAIN%)
start "ngrok-catalogo" cmd /c "ngrok http --domain=%NGROK_CATALOG_DOMAIN% 5173"
echo.
echo Cuando el front este en :5173, los links seran:
echo   https://%NGROK_CATALOG_DOMAIN%/catalogo/MZA-001
exit /b 0
