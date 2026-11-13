/** Resumen de ficha de lead (Fase 7.5) — sin IA. */

function formatUsd(n: number): string {
  return (
    'USD ' +
    new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)
  );
}

export function buildLeadResumenLine(input: {
  operacion?: string;
  tipo?: string;
  zona?: string;
  presupuesto?: string | number;
  urgencia?: string;
}): string {
  const operacion = String(input.operacion || '')
    .trim()
    .toLowerCase();
  const tipo = String(input.tipo || '').trim();
  const zona = String(input.zona || '').trim();
  const urgencia = String(input.urgencia || '').trim();
  const presupuestoRaw = input.presupuesto;
  let presupuesto = '';
  if (presupuestoRaw != null && String(presupuestoRaw).trim()) {
    const n = Number(String(presupuestoRaw).replace(/[^\d.]/g, ''));
    presupuesto =
      Number.isFinite(n) && n > 0 ? formatUsd(n) : String(presupuestoRaw).trim();
  }

  const parts: string[] = [];
  if (operacion || tipo || zona) {
    let verb = 'Quiere';
    if (operacion.includes('alquil')) verb = 'Quiere alquilar';
    else if (operacion.includes('venta') || operacion.includes('compr'))
      verb = 'Quiere comprar';
    const mid = [tipo, zona ? 'en ' + zona : ''].filter(Boolean).join(' ');
    if (mid) parts.push(verb + ' ' + mid + '.');
    else if (verb !== 'Quiere') parts.push(verb + '.');
  }
  if (presupuesto) parts.push('Hasta ' + presupuesto + '.');
  if (urgencia) parts.push(urgencia.endsWith('.') ? urgencia : urgencia + '.');

  if (!parts.length) return 'Todavía no contó qué busca.';
  return parts.join(' ');
}
