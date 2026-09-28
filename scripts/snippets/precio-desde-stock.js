/**
 * Si preguntan el precio de una propiedad del stock, el texto sale del stock.
 * El modelo no inventa el monto, la moneda ni un precio de algo que ya no está.
 */
function campoStock(row, keys) {
  for (let i = 0; i < keys.length; i++) {
    const v = row && row[keys[i]];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function monedaDeTexto(s) {
  const t = String(s || '');
  if (/U\$S|\bUSD\b|US\$/i.test(t)) return 'USD';
  if (/\bARS\b/i.test(t)) return 'ARS';
  if (/\$/.test(t)) return 'ARS';
  return '';
}

function monedaDeFila(row, raw) {
  const col = monedaDeTexto(campoStock(row, ['currency', 'moneda', 'Currency', 'Moneda']));
  if (col) return col;
  return monedaDeTexto(raw);
}

function estaDisponible(row) {
  const estado = campoStock(row, ['estado', 'Estado', 'status']).toLowerCase();
  if (!estado) return true;
  return estado === 'disponible' || estado === 'activo' || estado === 'activa';
}

function esAlquilerFila(row) {
  const op = campoStock(row, ['operacion', 'Operacion', 'tipo_operacion', 'operation_type']).toLowerCase();
  return /\b(alquil|rent)/.test(op);
}

function unidadAlquiler(row, raw) {
  const blob = (campoStock(row, ['periodo', 'unidad', 'frecuencia', 'periodo_alquiler']) + ' ' + raw).toLowerCase();
  if (/por\s+semana|semanal/.test(blob)) return 'por semana';
  if (/por\s+d[ií]a|diario/.test(blob)) return 'por dia';
  if (/por\s+a[nñ]o|anual/.test(blob)) return 'por ano';
  return 'por mes';
}

function formatearMonto(raw) {
  const nums = String(raw || '').replace(/[^\d]/g, '');
  if (!nums) return '';
  return nums.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function similaresDisponibles(list, row) {
  const id = campoStock(row, ['id', 'ID', 'codigo']).toUpperCase();
  const alquiler = esAlquilerFila(row);
  const otros = list.filter((r) => {
    if (!r || !estaDisponible(r)) return false;
    return campoStock(r, ['id', 'ID', 'codigo']).toUpperCase() !== id;
  });
  const mismos = otros.filter((r) => esAlquilerFila(r) === alquiler);
  const elegidos = (mismos.length ? mismos : otros).slice(0, 2);
  const ids = [];
  for (let i = 0; i < elegidos.length; i++) {
    const sid = campoStock(elegidos[i], ['id', 'ID', 'codigo']);
    if (sid) ids.push(sid);
  }
  return ids;
}

function precioPedidoDesdeStock(texto, rows) {
  const t = String(texto || '');
  if (!/\b(cu[aá]nto\s+sale|cu[aá]nto\s+est[aá]|cu[aá]nto\s+vale|a\s+cu[aá]nto|qu[eé]\s+precio|el\s+precio|precio)\b/i.test(t)) {
    return null;
  }
  const list = Array.isArray(rows) ? rows : [];
  const codes = t.toUpperCase().match(/\b[A-Z]{2,5}-\d{2,4}\b/g) || [];
  let row = null;
  for (const code of codes) {
    row = list.find((r) => campoStock(r, ['id', 'ID', 'codigo']).toUpperCase() === code);
    if (row) break;
  }
  if (!row) {
    const bajo = t.toLowerCase();
    const hits = list.filter((r) => {
      const dir = campoStock(r, ['direccion', 'Direccion', 'titulo']).toLowerCase();
      return dir.length > 4 && bajo.includes(dir);
    });
    if (hits.length === 1) row = hits[0];
  }
  if (!row) return null;
  const id = campoStock(row, ['id', 'ID', 'codigo']);
  if (!estaDisponible(row)) {
    return {
      id: id,
      mostrar: false,
      similares: similaresDisponibles(list, row),
      texto: 'Esa ya no esta disponible. Si queres te paso opciones parecidas.',
    };
  }
  const raw = campoStock(row, ['precio', 'Precio', 'precio_usd', 'price']);
  const moneda = monedaDeFila(row, raw);
  const formatted = formatearMonto(raw);
  if (!moneda || !formatted) return null;
  if (esAlquilerFila(row)) {
    return {
      id: id,
      mostrar: true,
      texto: 'El alquiler es de ' + moneda + ' ' + formatted + ' ' + unidadAlquiler(row, raw),
    };
  }
  return { id: id, mostrar: true, texto: 'Sale ' + moneda + ' ' + formatted };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { precioPedidoDesdeStock };
}
