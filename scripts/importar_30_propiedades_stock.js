/**
 * Importa `csv/Simulacion_30_Propiedades_Mendoza.csv` (31 filas con encabezado) en la planilla de stock.
 *
 * Uso:  npm run import-stock
 *       node scripts/importar_30_propiedades_stock.js
 *
 * ID de planilla: GOOGLE_SHEET_PROPIEDADES_ID en .env (raíz) o argumento:
 *       node scripts/_cargar_propiedades_simulacion_mendoza.js TU_ID
 *
 * Ver: docs/Setup Google Sheets API.md
 */
require('./_cargar_propiedades_simulacion_mendoza.js');
