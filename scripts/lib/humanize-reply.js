'use strict';

/**
 * humanizeReply — reglas OmniCRM 74b (copiadas, sin importar el paquete).
 * Fuente única; el patch la inyecta en Parsear Respuesta Base.
 */

const PROTECT_RE =
  /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|(USD\s?[\d.]+)|(US\$\s?[\d.]+)|(\$\s?[\d.]+)|(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)|(\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?)/gi;

const BOT_PHRASES_ES = [
  'claro!',
  'perfecto!',
  'entendido!',
  'por supuesto!',
  'dale!',
  'ok!',
  'okey!',
  'cómo estás?',
  'como estas?',
  'cómo andás?',
  'como andas?',
  'soy matías, tu asistente virtual',
  'soy matias, tu asistente virtual',
];

function stripChatMarkdown(text) {
  let t = String(text || '');
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/__([^_]+)__/g, '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/^\s*[-*]\s+/gm, '');
  t = t.replace(/^\s*\d+\.\s+/gm, '');
  return t;
}

function protect(text) {
  const slots = [];
  const out = String(text || '').replace(PROTECT_RE, (m) => {
    const i = slots.length;
    slots.push(m);
    return `\u0000P${i}\u0000`;
  });
  return { text: out, slots };
}

function restore(text, slots) {
  return String(text || '').replace(/\u0000P(\d+)\u0000/g, (_, n) => slots[Number(n)] || '');
}

function stripInvertedMarks(text) {
  return String(text || '').replace(/[¡¿]/g, '');
}

function normalizePunctuation(text) {
  let t = String(text || '');
  t = t.replace(/!{2,}/g, '!');
  t = t.replace(/\?{2,}/g, '?');
  t = t.replace(/!\?/g, '!');
  t = t.replace(/\?!/g, '!');
  const parts = t.split('!');
  if (parts.length > 2) {
    t = parts[0] + '!' + parts.slice(1).join('');
  }
  return t;
}

function emDashToComma(text) {
  return String(text || '').replace(/—/g, ',');
}

function stripBotPhrases(text) {
  let t = String(text || '').trim();
  const lower = t.toLowerCase();
  for (const phrase of BOT_PHRASES_ES) {
    const p = phrase.toLowerCase();
    if (lower === p) return t; // solo: no borrar (regla H2 vía caller)
    if (lower.startsWith(p + ' ') || lower.startsWith(p + '\n')) {
      t = t.slice(phrase.length).trim();
      break;
    }
    if (lower.endsWith(' ' + p) || lower.endsWith('\n' + p)) {
      t = t.slice(0, t.length - phrase.length).trim();
      break;
    }
  }
  return t;
}

/**
 * @param {string} input
 * @returns {string}
 */
function humanizeReply(input) {
  let t = String(input || '');
  if (!t.trim()) return t;

  t = stripChatMarkdown(t);
  const { text: protectedText, slots } = protect(t);
  t = protectedText;
  t = stripInvertedMarks(t);
  t = normalizePunctuation(t);
  t = emDashToComma(t);
  const afterProtect = restore(t, slots);
  t = afterProtect;

  const stripped = stripBotPhrases(t);
  if (!String(stripped || '').trim()) {
    return afterProtect.trim();
  }
  return stripped.trim();
}

module.exports = {
  humanizeReply,
  PROTECT_RE,
  BOT_PHRASES_ES,
  stripChatMarkdown,
  stripBotPhrases,
};
