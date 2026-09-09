/**
 * Prepara una fila para la hoja `Conversaciones_Revision` (revisión humana).
 *
 * Entradas esperadas desde el workflow:
 * - `repeticion_detectada` (boolean)
 * - `lead_completo` (WA: 'si'/'no' | TG: boolean)
 * - turnos: WA usa `consultas_count` como proxy, TG usa `turno`
 * - `historial_json` (string JSON)
 * - `mensajes_extra` (string JSON de mensajes adicionales, si existe)
 * - último mensaje + respuesta:
 *   - WA: `mensaje` + `respuesta_wa`
 *   - TG: `texto_usuario` + `respuesta_bot`
 */

const CANAL = '__CANAL__';
const UMBRAL_TURNOS_SIN_CLASIFICAR = 6;

function leadCompletoToBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').trim().toLowerCase();
  if (!s) return false;
  return s === 'si' || s === 'true' || s === 'calificado' || s === '1';
}

const repeticionDetectada = Boolean($json.repeticion_detectada);
const rateLimit = Boolean($json.rate_limit);
const leadCompleto = leadCompletoToBool($json.lead_completo);

// Proxy determinístico de "turnos" sin tocar el clasificador/IA
const turnos = Number($json.turno || $json.consultas_count || 0) || 0;
const sinClasificar = !leadCompleto && turnos >= UMBRAL_TURNOS_SIN_CLASIFICAR;

let motivo = '';
if (rateLimit) motivo = 'rate_limit';
else if (repeticionDetectada) motivo = 'REPETICION';
else if (sinClasificar) motivo = 'SIN_CLASIFICAR';

const registrar_revision = Boolean(motivo);
const fecha_hora = new Date().toISOString();

const chat_id = String($json.chat_id || '').trim();
const lead_name = String($json.lead_name || $json.nombre_usuario || '').trim();
const ultimo_mensaje_cliente = String($json.texto_usuario || $json.mensaje || '').trim();
const respuesta_bot = String($json.respuesta_bot || $json.respuesta_wa || '').trim();

return [
  {
    json: {
      registrar_revision,
      motivo,
      fecha_hora,
      canal: CANAL,
      chat_id,
      lead_name,
      ultimo_mensaje_cliente,
      respuesta_bot,
      historial_json: String($json.historial_json || '[]'),
      mensajes_extra: String($json.mensajes_extra || '[]'),
    },
  },
];

