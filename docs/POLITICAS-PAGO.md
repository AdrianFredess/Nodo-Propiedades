# Políticas de pago (Sheets)

## Hoja `Politicas_Pago`

En el mismo spreadsheet del stock (`1sAXgJDFkFbiLPDdqw4vYyCeVC4heWAJ3n92jlrIW-SU`):

1. Creá una hoja llamada exactamente `Politicas_Pago`
2. Pegá el contenido de `csv/Politicas_Pago.csv` (fila 1 = encabezados `clave,valor`)
3. Reemplazá todos los `EDITAR_EN_SHEETS` por datos reales (alias/CBU/titular)

El bot (nodo **Leer Politicas Pago**) inyecta esas filas en el system prompt. Si la hoja no existe, usa placeholders seguros (no inventa CBU).

## Columnas opcionales en stock (`Hoja 1`)

Podés agregar (sin regenerar CSV 30):

| Columna | Uso |
|---------|-----|
| `honorarios` | % o texto de comisión |
| `reserva` | seña / reserva |
| `medios_pago` | transferencia, efectivo, etc. |
| `alias_cbu` | alias o CBU de esa propiedad (si aplica) |
| `requisitos` | requisitos específicos |

El panel muestra estos campos en la ficha de propiedad cuando vienen en la API.
