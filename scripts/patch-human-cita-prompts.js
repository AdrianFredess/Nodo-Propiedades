/**
 * Humaniza prompts TG + WA y agrega link de formulario de cita (ngrok).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

function loadApiKey() {
  const mcp = JSON.parse(
    fs.readFileSync(
      path.join(process.env.USERPROFILE, '.cursor/mcp.json'),
      'utf8',
    ),
  );
  for (const s of Object.values(mcp.mcpServers || {})) {
    if (s?.env?.N8N_API_KEY) return s.env.N8N_API_KEY;
  }
  throw new Error('Sin N8N_API_KEY');
}
const KEY = loadApiKey();
const CITA_BASE =
  'https://deranged-defile-comrade.ngrok-free.dev/webhook/cita-form';

function request(method, urlPath, body) {
  const url = new URL(urlPath, 'http://localhost:5678');
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'X-N8N-API-KEY': KEY,
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            json = { raw: data };
          }
          if (res.statusCode >= 400) {
            reject(
              new Error(
                `${method} ${urlPath} ${res.statusCode} ${JSON.stringify(json).slice(0, 800)}`,
              ),
            );
            return;
          }
          resolve(json);
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const HUMAN_BLOCK_TG = `
ESTILO HUMANO (imprescindible — nadie debe notar que sos automatizado):
- Sos Matías, asesor real de Nodo Propiedades. Hablá como en un chat de WhatsApp/Telegram con un cliente: natural, cálido, concreto.
- NUNCA digas que sos bot, IA, asistente virtual, automatizado ni "sistema".
- Mensajes cortos (2–4 oraciones). Una sola pregunta por turno.
- Usá el nombre del cliente si lo tenés. Variá saludos ("Hola", "Buenas", "Dale").
- Conectores naturales: "perfecto", "dale", "mirá", "te cuento", "si querés". PROHIBIDO "che".
- No suenes a catálogo: priorizá 1–3 opciones relevantes, no listas interminables.
- Si el cliente duda, acompañá sin presión. Si tiene apuro, andá al grano.

VISITAS / CITAS:
- Cuando el cliente quiera visitar, agendar o "ir a ver" una propiedad, confirmá con naturalidad y pasale ESTE link para que complete fecha/horario (no digas "formulario de sistema"; decí algo tipo "te paso el link rapidito para coordinar día y hora"):
  LINK_CITA
- Después del link, una frase corta: que con eso ya lo agendan y le confirman.
- Si ya te dijo día/hora en el chat, igual pasá el link para formalizar (pre-cargamos lo que podamos).
`;

const HUMAN_BLOCK_WA = `
ESTILO HUMANO (imprescindible):
- Sos un asesor real de Nodo Propiedades por WhatsApp. Nadie debe notar automatización.
- NUNCA menciones bot, IA, asistente virtual ni automatizado.
- Respuestas cortas, naturales, 2–4 oraciones. Una pregunta por mensaje.
- Tono rioplatense neutro profesional: "dale", "perfecto", "te cuento". Sin "che". Sin emojis excesivos (máx 1).
- No listes todo el stock: ofrecé lo más afinado a lo que pidió.

VISITAS:
- Si pide visita/cita/ver la propiedad, en "respuesta" incluí de forma natural este link para que complete fecha y horario:
  LINK_CITA
- Frase tipo: "Dale, te paso el link para que elijas día y horario y lo coordinamos."
`;

function putSettings(wf) {
  const s = wf.settings || {};
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {
      executionOrder: s.executionOrder || 'v1',
      ...(s.timezone ? { timezone: s.timezone } : {}),
      ...(s.saveManualExecutions != null
        ? { saveManualExecutions: s.saveManualExecutions }
        : {}),
      ...(s.callerPolicy ? { callerPolicy: s.callerPolicy } : {}),
    },
  };
}

async function patchTelegram(wf) {
  const node = wf.nodes.find((n) => n.name === 'Construir Prompt');
  if (!node) throw new Error('Construir Prompt missing');
  let code = node.parameters.jsCode;
  if (code.includes('ESTILO HUMANO (imprescindible')) {
    console.log('TG human already');
  } else {
    // Inject cita link variable + human block into systemPrompt construction
    const injectVars = `
const citaLink = '${CITA_BASE}' + '?chat_id=' + encodeURIComponent(String(chatId||'')) + '&nombre=' + encodeURIComponent(String(nombreUsuario||'')) + '&canal=telegram';
const estiloHumanoCita = \`${HUMAN_BLOCK_TG.replace(/`/g, '\\`').replace(/LINK_CITA/g, '${citaLink}')}\`;
`;
    // Insert after nombreUsuario assignment
    if (!code.includes('const citaLink =')) {
      code = code.replace(
        'const nombreUsuario = setVars.nombre_usuario;',
        'const nombreUsuario = setVars.nombre_usuario;\n' + injectVars,
      );
    }
    // Append estilo to systemPrompt if we find systemPrompt =
    if (code.includes('systemPrompt =') && !code.includes('estiloHumanoCita')) {
      code = code.replace(
        /systemPrompt\s*=\s*/,
        'systemPrompt = estiloHumanoCita + \"\\n\\n\" + ',
      );
    }
    node.parameters.jsCode = code;
  }
  return wf;
}

async function patchWhatsApp(wf) {
  const node = wf.nodes.find((n) => n.name === 'Code - Armar Prompt');
  if (!node) throw new Error('Armar Prompt missing');
  let code = node.parameters.jsCode;
  if (code.includes('ESTILO HUMANO (imprescindible)')) {
    console.log('WA human already — refresh cita link');
  }
  // Always ensure cita link in prompt template
  const linkExpr = `\${'${CITA_BASE}?chat_id=' + encodeURIComponent(String(prep.chat_id||'')) + '&nombre=' + encodeURIComponent(String(prep.lead_name||'')) + '&canal=whatsapp' + (zona ? '&zona=' + encodeURIComponent(zona) : '')}`;

  if (!code.includes('ESTILO HUMANO (imprescindible)')) {
    const block = HUMAN_BLOCK_WA.replace(
      'LINK_CITA',
      '${citaLinkWa}',
    );
    // add citaLinkWa before prompt =
    code = code.replace(
      'const prompt = `',
      `const citaLinkWa = '${CITA_BASE}?chat_id=' + encodeURIComponent(String(prep.chat_id||'')) + '&nombre=' + encodeURIComponent(String(prep.lead_name||'')) + '&canal=whatsapp' + (datosPrev.zona ? '&zona=' + encodeURIComponent(String(datosPrev.zona)) : '');\nconst prompt = \``,
    );
    code = code.replace(
      'REGLAS:\nTEMPERATURA',
      `${block}\nREGLAS:\nTEMPERATURA`,
    );
    // if REGLAS without TEMPERATURA
    if (!code.includes('ESTILO HUMANO (imprescindible)')) {
      code = code.replace('REGLAS:\n', `${block}\nREGLAS:\n`);
    }
  }
  // Soften "asistente virtual oficial" if present
  code = code.replace(
    /Sos el asistente virtual oficial de la inmobiliaria "Nodo Propiedades"/g,
    'Sos Matías, asesor de Nodo Propiedades',
  );
  code = code.replace(
    /Atendes por WhatsApp\. Tono: profesional, claro, cordial, rioplatense neutro\. Nada de slang ni emojis excesivos \(maximo 1 si aporta\)\./g,
    'Atendés por WhatsApp como una persona real. Tono natural, cercano y profesional. Nadie debe notar que hay automatización. Máximo 1 emoji si suma.',
  );
  node.parameters.jsCode = code;
  return wf;
}

async function main() {
  const tg = await request('GET', '/api/v1/workflows/8JoSfkcn3pE1f0av');
  await patchTelegram(tg);
  await request('PUT', `/api/v1/workflows/${tg.id}`, putSettings(tg));
  console.log('TG patched');

  const wa = await request('GET', '/api/v1/workflows/npq6sC6YLaUBpHac');
  await patchWhatsApp(wa);
  await request('PUT', `/api/v1/workflows/${wa.id}`, putSettings(wa));
  console.log('WA patched');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
