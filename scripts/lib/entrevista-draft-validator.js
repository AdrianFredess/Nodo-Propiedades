'use strict';

const TONO_OK = new Set(['profesional_cercano', 'formal', 'distendido']);
const GUIA_TIPOS = new Set(['estilo', 'preguntar_antes', 'derivar']);
const OPERACIONES_OK = new Set(['venta', 'alquiler', 'temporario']);

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || ''));
}

/**
 * Valida el borrador JSON de la entrevista (salida Groq).
 * @returns {{ ok: true, draft: object } | { ok: false, errors: string[] }}
 */
function validateEntrevistaDraft(raw) {
  const errors = [];
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['json_no_objeto'] };
  }

  const tono = String(raw.tono || '').trim();
  if (!TONO_OK.has(tono)) errors.push('tono_invalido');

  const inmobiliaria_nombre = String(raw.inmobiliaria_nombre || '').trim();
  const asesor_nombre = String(raw.asesor_nombre || '').trim();
  if (!inmobiliaria_nombre) errors.push('inmobiliaria_requerida');
  if (!asesor_nombre) errors.push('asesor_requerido');

  const zonasIn = Array.isArray(raw.zonas) ? raw.zonas : [];
  const zonas = zonasIn.map((z) => String(z || '').trim()).filter(Boolean).slice(0, 30);

  const operacionesIn = Array.isArray(raw.operaciones) ? raw.operaciones : [];
  const operaciones = [];
  for (const o of operacionesIn) {
    const v = String(o || '').trim().toLowerCase();
    if (v && OPERACIONES_OK.has(v)) operaciones.push(v);
  }

  const guiasIn = Array.isArray(raw.guias) ? raw.guias : [];
  if (guiasIn.length > 15) errors.push('guias_max_15');
  const guias = [];
  for (const g of guiasIn) {
    const tipo = String(g?.tipo || '').trim();
    const texto = String(g?.texto || '').trim();
    if (!tipo && !texto) continue;
    if (!GUIA_TIPOS.has(tipo)) {
      errors.push('guia_tipo_invalido');
      continue;
    }
    if (texto.length > 300) errors.push('guia_texto_largo');
    if (texto) guias.push({ tipo, texto: texto.slice(0, 300) });
  }

  const horario_humano_desde = String(raw.horario_humano_desde || '').trim();
  const horario_humano_hasta = String(raw.horario_humano_hasta || '').trim();
  if (!isHHMM(horario_humano_desde) || !isHHMM(horario_humano_hasta)) {
    errors.push('horario_invalido');
  }

  const ejemplo_estilo = String(raw.ejemplo_estilo || '').slice(0, 400);

  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  const draft = {
    inmobiliaria_nombre,
    asesor_nombre,
    tono,
    zonas,
    operaciones,
    guias,
    horario_humano_desde,
    horario_humano_hasta,
    ejemplo_estilo,
  };
  return { ok: true, draft };
}

/** Mapea borrador de entrevista → campos bot-config (conserva extras del caller). */
function mergeDraftIntoBotConfig(draft, baseConfig) {
  const b = baseConfig && typeof baseConfig === 'object' ? baseConfig : {};
  const d = draft && typeof draft === 'object' ? draft : {};
  return {
    ...b,
    tono: d.tono || b.tono || 'profesional_cercano',
    inmobiliaria_nombre: d.inmobiliaria_nombre || b.inmobiliaria_nombre || '',
    asesor_nombre: d.asesor_nombre || b.asesor_nombre || '',
    vendedor_nombre: d.asesor_nombre || b.vendedor_nombre || b.asesor_nombre || 'Matías',
    zonas: Array.isArray(d.zonas) ? d.zonas : b.zonas || [],
    operaciones: Array.isArray(d.operaciones) ? d.operaciones : b.operaciones || [],
    guias: Array.isArray(d.guias) ? d.guias : b.guias || [],
    horario_humano_desde: d.horario_humano_desde || b.horario_humano_desde || '09:00',
    horario_humano_hasta: d.horario_humano_hasta || b.horario_humano_hasta || '18:00',
    ejemplo_estilo: d.ejemplo_estilo || b.ejemplo_estilo || '',
  };
}

module.exports = {
  validateEntrevistaDraft,
  mergeDraftIntoBotConfig,
  TONO_OK,
  GUIA_TIPOS,
};
