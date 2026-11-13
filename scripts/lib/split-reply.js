'use strict';

/**
 * splitReplyParts — OmniCRM split-reply (máx. 3 partes por línea en blanco).
 */

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitReplyParts(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const chunks = raw
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (chunks.length <= 1) return chunks.length ? [raw] : [];
  if (chunks.length === 2) return chunks;
  return [chunks[0], chunks[1], chunks.slice(2).join('\n\n')];
}

/**
 * Pausa entre partes: min(4, max(1, largo/40)) segundos → ms
 * @param {string} part
 */
function pausaMsForPart(part) {
  const sec = Math.min(4, Math.max(1, String(part || '').length / 40));
  return Math.round(sec * 1000);
}

module.exports = { splitReplyParts, pausaMsForPart };
