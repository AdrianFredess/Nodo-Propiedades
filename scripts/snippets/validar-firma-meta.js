const crypto = require('crypto');

function rawBody() {
  const item = $input.first();
  const bin = item.binary && (item.binary.data || item.binary.body);
  if (bin && bin.data) return Buffer.from(bin.data, 'base64');
  const body = item.json && item.json.body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body && typeof body === 'object') return Buffer.from(JSON.stringify(body));
  return Buffer.from('');
}

const item = $input.first().json || {};
const headers = item.headers || {};
const header = String(headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'] || '');
const secret = String(($env && $env.META_APP_SECRET) || '');
const raw = rawBody();
let firma_ok = false;
if (secret && header.startsWith('sha256=')) {
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'));
  const got = Buffer.from(header);
  firma_ok = expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

return [{ json: { ...item, firma_ok }, binary: $input.first().binary }];
