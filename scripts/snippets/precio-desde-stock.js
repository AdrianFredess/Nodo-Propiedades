/**
 * Si preguntan el precio de una propiedad del stock, el texto sale del stock.
 * El modelo no inventa el monto.
 */
function precioPedidoDesdeStock(texto, rows) {
  const t = String(texto || '');
  if (!/\b(cu[aá]nto\s+sale|cu[aá]nto\s+est[aá]|cu[aá]nto\s+vale|a\s+cu[aá]nto|qu[eé]\s+precio|el\s+precio|precio)\b/i.test(t)) {
    return null;
  }
  const list = Array.isArray(rows) ? rows : [];
  const codes = t.toUpperCase().match(/\b[A-Z]{2,5}-\d{2,4}\b/g) || [];
  let row = null;
  for (const code of codes) {
    row = list.find((r) => String((r && (r.id || r.ID || r.codigo)) || '').toUpperCase() === code);
    if (row) break;
  }
  if (!row) {
    const bajo = t.toLowerCase();
    const hits = list.filter((r) => {
      const dir = String((r && (r.direccion || r.Direccion || r.titulo)) || '').trim().toLowerCase();
      return dir.length > 4 && bajo.includes(dir);
    });
    if (hits.length === 1) row = hits[0];
  }
  if (!row) return null;
  const raw = String(row.precio || row.Precio || '');
  const nums = raw.replace(/[^\d]/g, '');
  if (!nums) return null;
  const formatted = nums.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const id = String(row.id || row.ID || row.codigo || '');
  return { id: id, texto: 'Sale USD ' + formatted };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { precioPedidoDesdeStock };
}
