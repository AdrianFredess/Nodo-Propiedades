'use strict';

/**
 * Resumen de ficha de lead (Fase 7.5) — sin IA.
 */

function formatUsd(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '';
  return (
    'USD ' +
    new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(num)
  );
}

/**
 * @param {{
 *   operacion?: string,
 *   tipo?: string,
 *   zona?: string,
 *   presupuesto?: string|number,
 *   urgencia?: string,
 * }} lead
 */
function buildLeadResumenLine(lead) {
  const o = lead || {};
  const operacion = String(o.operacion || '').trim().toLowerCase();
  const tipo = String(o.tipo || '').trim();
  const zona = String(o.zona || '').trim();
  const urgencia = String(o.urgencia || '').trim();
  const presupuestoRaw = o.presupuesto;
  let presupuesto = '';
  if (presupuestoRaw != null && String(presupuestoRaw).trim()) {
    const n = Number(String(presupuestoRaw).replace(/[^\d.]/g, ''));
    presupuesto = Number.isFinite(n) && n > 0 ? formatUsd(n) : String(presupuestoRaw).trim();
  }

  const parts = [];
  if (operacion || tipo || zona) {
    let verb = 'Quiere';
    if (operacion.includes('alquil')) verb = 'Quiere alquilar';
    else if (operacion.includes('venta') || operacion.includes('compr')) verb = 'Quiere comprar';
    const mid = [tipo, zona ? 'en ' + zona : ''].filter(Boolean).join(' ');
    if (mid) parts.push(verb + ' ' + mid + '.');
    else if (verb !== 'Quiere') parts.push(verb + '.');
  }
  if (presupuesto) parts.push('Hasta ' + presupuesto + '.');
  if (urgencia) parts.push(urgencia.endsWith('.') ? urgencia : urgencia + '.');

  if (!parts.length) return 'Todavía no contó qué busca.';
  return parts.join(' ');
}

module.exports = { buildLeadResumenLine, formatUsd };
