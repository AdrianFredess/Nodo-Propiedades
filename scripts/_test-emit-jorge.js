/**
 * Emite chat.message artificial con historial real de jorge (última ejecución TG)
 * para sincronizar el panel sin Sheets.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

function postJson(urlStr, body) {
  const u = new URL(urlStr);
  const payload = JSON.stringify(body);
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: d });
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  // Prefer historial from last known execution dump if present
  let historial_json = '[]';
  const dump = path.join(
    process.env.USERPROFILE,
    '.cursor/projects/d-Dev-Nodo-Propiedades/agent-tools/3a512470-0a7e-4c92-a1e9-b31adb5ff05d.txt',
  );
  if (fs.existsSync(dump)) {
    const t = fs.readFileSync(dump, 'utf8');
    const m = t.match(/"historial_json":\s*"(\[.*?\])"/s);
    if (m) {
      try {
        historial_json = JSON.parse(`"${m[1]}"`);
      } catch {
        historial_json = m[1].replace(/\\n/g, '\\n');
      }
    }
  }

  // Fallback: reconstruct from known last turn
  if (!historial_json || historial_json === '[]' || historial_json.length < 20) {
    historial_json = JSON.stringify([
      { role: 'user', content: 'que propiedades tenes a 45 mil dolares' },
      {
        role: 'assistant',
        content:
          'Con ese presupuesto de USD 45 000 para alquiler en Godoy Cruz no tengo inmuebles disponibles en este momento. ¿Te gustaría que un asesor de Nodo Propiedades te contacte cuando haya opciones que encajen con tu búsqueda?',
      },
    ]);
  }

  const payload = {
    type: 'chat.message',
    payload: {
      chatId: '1947576481',
      mensajeCliente: 'que propiedades tenes a 45 mil dolares',
      respuestaBot:
        'Con ese presupuesto de USD 45 000 para alquiler en Godoy Cruz no tengo inmuebles disponibles en este momento. ¿Te gustaría que un asesor de Nodo Propiedades te contacte cuando haya opciones que encajen con tu búsqueda?',
      nombre: 'jorge',
      temperatura: 'tibio',
      presupuesto: 'USD 45000',
      historial_json,
      status: 'abierto',
      source: 'telegram',
    },
  };

  console.log('POST panel-realtime-emit…');
  const viaN8n = await postJson(
    'http://127.0.0.1:5678/webhook/panel-realtime-emit',
    payload,
  );
  console.log('n8n emit:', viaN8n.status, viaN8n.body.slice(0, 300));

  console.log('POST ws-bridge /emit…');
  const viaWs = await postJson('http://127.0.0.1:3099/emit', payload);
  console.log('ws emit:', viaWs.status, viaWs.body.slice(0, 300));

  console.log('ws health:');
  await new Promise((resolve, reject) => {
    http
      .get('http://127.0.0.1:3099/health', (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          console.log(d);
          resolve();
        });
      })
      .on('error', reject);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
