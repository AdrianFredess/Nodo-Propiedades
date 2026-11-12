#!/usr/bin/env node
'use strict';

/**
 * Fase 6 STOP 2 (aprobado): Politicas_Pago de demo Mendoza, sin CBU/alias/cuentas reales.
 */
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  loadEnv,
  apiKey,
  request,
  sheetsCred,
  httpSteps,
  valuesToCsv,
} = require('../lib/n8n-http-helper');

const DOC = '1sAXgJDFkFbiLPDdqw4vYyCeVC4heWAJ3n92jlrIW-SU';
const ROWS = [
  ['clave', 'valor'],
  [
    'nota_demo',
    'DATOS DE DEMO — Nodo Propiedades (Mendoza). No son cuentas bancarias reales.',
  ],
  [
    'transferencia',
    'DEMO: se coordina transferencia con el asesor (sin CBU ni alias publicados en el bot).',
  ],
  [
    'efectivo',
    'DEMO: se acepta efectivo en oficina con comprobante. Coordinar día y monto de seña/reserva.',
  ],
  [
    'reserva',
    'DEMO: seña típica venta ~3–5% del precio pactado; se acredita y confirma por escrito. No garantiza la operación hasta validación.',
  ],
  [
    'cuotas',
    'DEMO: planes en cuotas solo si la ficha del inmueble lo indica. Si no figura, derivar a asesor.',
  ],
  [
    'honorarios_venta',
    'DEMO Mendoza: honorarios de venta orientativos 3% + IVA (comprador) / 3% + IVA (vendedor), confirmar en cada operación.',
  ],
  [
    'honorarios_alquiler',
    'DEMO Mendoza: honorarios de alquiler orientativos 1 mes de alquiler + IVA (confirmar con asesor).',
  ],
  [
    'requisitos_alquiler',
    'DEMO: DNI, recibos de sueldo (últimos 3), garantía propietaria o seguro de caución. Confirmar caso por caso.',
  ],
  [
    'requisitos_compra',
    'DEMO: DNI, seña/reserva, operatoria con escribano. Apto crédito según ficha.',
  ],
  [
    'medios_pago',
    'DEMO: transferencia bancaria coordinada, efectivo en oficina, cheque diferido solo con acuerdo previo.',
  ],
  [
    'oficina',
    'DEMO: atención en Mendoza capital · lun–vie 9:00–18:00 · sáb 9:00–13:00 (demo, no dirección real).',
  ],
];

async function main() {
  loadEnv();
  const key = apiKey();
  const { cred } = await sheetsCred(key);
  const today = new Date().toISOString().slice(0, 10);
  const bak = path.join(ROOT, 'docs', 'ops', `backup-planillas-${today}`);
  fs.mkdirSync(bak, { recursive: true });

  const before = await httpSteps(
    key,
    cred,
    [
      {
        name: 'P',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/${encodeURIComponent('Politicas_Pago')}`,
      },
      {
        name: 'Meta',
        method: 'GET',
        url: `https://sheets.googleapis.com/v4/spreadsheets/${DOC}?fields=sheets.properties`,
      },
    ],
    '_TMP pol bak',
  );
  fs.writeFileSync(
    path.join(bak, 'Politicas_Pago-antes.csv'),
    valuesToCsv(before.P?.values || []),
  );

  const titles = (before.Meta?.sheets || []).map((s) => s.properties?.title);
  const steps = [];
  if (!titles.includes('Politicas_Pago')) {
    steps.push({
      name: 'Add',
      method: 'POST',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${DOC}:batchUpdate`,
      body: {
        requests: [{ addSheet: { properties: { title: 'Politicas_Pago' } } }],
      },
    });
  }
  steps.push({
    name: 'Clear',
    method: 'POST',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/${encodeURIComponent('Politicas_Pago')}:clear`,
    body: {},
  });
  steps.push({
    name: 'Put',
    method: 'PUT',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${DOC}/values/${encodeURIComponent('Politicas_Pago!A1')}?valueInputOption=RAW`,
    body: { values: ROWS },
  });
  await httpSteps(key, cred, steps, '_TMP pol apply');
  fs.writeFileSync(path.join(bak, 'Politicas_Pago-demo.csv'), valuesToCsv(ROWS));
  console.log(
    JSON.stringify(
      {
        ok: true,
        rows: ROWS.length - 1,
        backup: bak,
        note: 'STOP 2 demo — sin CBU/alias/cuentas reales',
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
