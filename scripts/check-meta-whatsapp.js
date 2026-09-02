/**
 * Diagnóstico rápido Meta WhatsApp Cloud API (inbound WABA + outbound test).
 *
 * Uso:
 *   node scripts/check-meta-whatsapp.js
 *   node scripts/check-meta-whatsapp.js 5492612084544
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

function loadEnv(key) {
  if (!fs.existsSync(ENV_PATH)) return '';
  const m = fs.readFileSync(ENV_PATH, 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? String(m[1]).trim().replace(/^["']|["']$/g, '') : '';
}

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, json: { raw: data } });
          }
        });
      })
      .on('error', reject);
  });
}

function post(url, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, json: { raw: data } });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function metaOutboundPhone(raw) {
  const p = String(raw || '').replace(/\D/g, '');
  if (/^549\d{8,11}$/.test(p)) return '54' + p.slice(3);
  return p;
}

async function main() {
  const token = loadEnv('META_ACCESS_TOKEN');
  const wabaId = loadEnv('META_WABA_ID');
  const phoneId = loadEnv('META_PHONE_NUMBER_ID');
  const graphVersion = loadEnv('META_GRAPH_VERSION') || 'v21.0';
  const testTo = metaOutboundPhone(
    process.argv[2] || loadEnv('ADVISOR_PHONE') || '5492612084544',
  );

  console.log('=== Meta WhatsApp diagnóstico ===\n');

  if (!token || !wabaId || !phoneId) {
    console.log('FALTA: META_ACCESS_TOKEN, META_WABA_ID o META_PHONE_NUMBER_ID en .env');
    process.exit(1);
  }

  const subs = await get(
    `https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps?access_token=${token}`,
  );
  const apps = subs.json?.data || [];
  const nodoApp = apps.find((a) => a.whatsapp_business_api_data?.name === 'Nodo Propiedades');
  console.log('WABA subscribed_apps:', apps.map((a) => a.whatsapp_business_api_data?.name).join(', ') || '(vacío)');
  if (!nodoApp) {
    console.log('\n❌ App "Nodo Propiedades" NO suscrita a la WABA.');
    console.log('   Fix: node scripts/patch-meta-whatsapp.js --deploy');
  } else {
    console.log('✅ App Nodo Propiedades suscrita');
  }

  const sendUrl = `https://graph.facebook.com/${graphVersion}/${phoneId}/messages?access_token=${token}`;
  const send = await post(sendUrl, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: testTo,
    type: 'text',
    text: { preview_url: false, body: 'Diagnóstico Nodo — si ves esto, outbound OK.' },
  });

  if (send.json?.messages?.[0]?.id) {
    console.log(`\n✅ Outbound OK → ${testTo} (wamid: ${send.json.messages[0].id})`);
    return;
  }

  const err = send.json?.error || {};
  console.log(`\n❌ Outbound falló → ${testTo}`);
  console.log(`   Código: ${err.code} — ${err.message}`);

  if (err.code === 131030) {
    console.log(`
CAUSA: modo desarrollo — el número NO está en la lista de destinatarios de prueba.

Pasos (2 min):
1. developers.facebook.com → App "Nodo Propiedades"
2. WhatsApp → API Setup
3. Campo "To" → Manage phone number list
4. Agregar: +${testTo.startsWith('54') ? testTo : testTo} (formato +5492612084544)
5. Confirmar código OTP en WhatsApp
6. Reenviar mensaje al +1 555 666 6891

Nota: el workflow SÍ procesa tu mensaje (n8n exec success) pero Meta bloquea la respuesta.
`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
