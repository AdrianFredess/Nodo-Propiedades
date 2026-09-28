const crypto = require('crypto');

const item = $input.first().json || {};
const headers = item.headers || {};
const norm = {};
for (const [k, v] of Object.entries(headers)) norm[String(k).toLowerCase()] = v;
const authHeader = String(norm.authorization || '');
const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
const got = String(norm['x-panel-token'] || bearer || '').trim();
let expected = '';
try {
  expected = String(($env && $env.PANEL_API_TOKEN) || '').trim();
} catch (e) {
  expected = '';
}
let authOk = false;
if (expected && got) {
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  authOk = a.length === b.length && crypto.timingSafeEqual(a, b);
}
return [{ json: { ...item, _authOk: authOk } }];
