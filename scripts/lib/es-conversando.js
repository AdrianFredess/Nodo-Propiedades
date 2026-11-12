'use strict';

/**
 * Columna "Conversando" del pipeline:
 * true solo si TODOS los mensajes del cliente son saludo o tienen menos de 4 palabras.
 */
const SALUDO_RE =
  /^(hola|buen[oa]s?(?:\s+(?:d[ií]as|tardes|noches))?|hey|hi|hello|qu[eé]\s+tal|c[oó]mo\s+va)\b/i;

function esConversando(mensajesUsuario) {
  const list = Array.isArray(mensajesUsuario) ? mensajesUsuario : [];
  if (!list.length) return true;
  return list.every((m) => {
    const t = String(m == null ? '' : m).trim();
    if (!t) return true;
    const words = t.split(/\s+/).filter(Boolean);
    return words.length < 4 || SALUDO_RE.test(t);
  });
}

module.exports = { esConversando, SALUDO_RE };
