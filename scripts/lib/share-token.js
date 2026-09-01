/**
 * Token corto determinístico por propiedad (links privados de ficha).
 * Mismo algoritmo en generate-propiedad-media.js y validación en el front.
 */
const crypto = require('crypto');

const DEFAULT_SECRET = 'nodo-dev-share';

function shareSecret() {
  return String(process.env.CATALOG_SHARE_SECRET || DEFAULT_SECRET).trim();
}

function shareToken(propiedadId, secret = shareSecret()) {
  const id = String(propiedadId || '').trim().toUpperCase();
  if (!id) return '';
  return crypto.createHmac('sha256', secret).update(id).digest('hex').slice(0, 12);
}

function publicFichaUrl(baseUrl, propiedadId, secret = shareSecret()) {
  const base = String(baseUrl || 'http://localhost:5173').replace(/\/$/, '');
  const id = encodeURIComponent(String(propiedadId || '').trim());
  const token = shareToken(propiedadId, secret);
  return `${base}/p/${id}/${token}`;
}

module.exports = { shareToken, shareSecret, publicFichaUrl };
