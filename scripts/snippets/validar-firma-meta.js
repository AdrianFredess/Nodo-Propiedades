const crypto = require('crypto');

function rawBody() {
  const item = $input.first();
  const bin = item.binary && (item.binary.data || item.binary.body);
  if (bin && bin.data) return { buf: Buffer.from(bin.data, 'base64'), fuente: 'binary' };
  return { buf: null, fuente: 'ausente' };
}

const item = $input.first().json || {};
const headers = item.headers || {};
const header = String(headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'] || '');
const secret = String(($env && $env.META_APP_SECRET) || '');
const raw = rawBody();
let firma_ok = false;
if (secret && raw.buf && header.startsWith('sha256=')) {
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(raw.buf).digest('hex'));
  const got = Buffer.from(header);
  firma_ok = expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

return [{ json: { ...item, firma_ok, firma_fuente: raw.fuente }, binary: $input.first().binary }];
