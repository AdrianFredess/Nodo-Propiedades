// Nodo Code: Build IDs
// Entrada esperada: un item con source, lead_name, phone, email, message, property_ref, timestamp
const item = $input.first().json;

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/[^\d+]/g, '');
}

function normalizeEmail(email) {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

function buildDedupeKey(phone, email) {
  if (phone) return `phone:${phone}`;
  if (email) return `email:${email}`;
  return `anonymous:${Date.now()}`;
}

const normalizedPhone = normalizePhone(item.phone);
const normalizedEmail = normalizeEmail(item.email);
const nowIso = new Date().toISOString();
const leadId = `ld_${Date.now()}`;

return [
  {
    json: {
      ...item,
      lead_id: item.lead_id || leadId,
      normalized_phone: normalizedPhone,
      normalized_email: normalizedEmail,
      dedupe_key: item.dedupe_key || buildDedupeKey(normalizedPhone, normalizedEmail),
      created_at: item.created_at || nowIso,
      updated_at: nowIso,
      last_interaction_at: item.timestamp || nowIso,
    },
  },
];


// Nodo Code: Validate AI Output
// Entrada esperada: un item con la respuesta del AI Agent en json o string JSON
const aiRaw = $input.first().json;

function ensureObject(value) {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }
  return value;
}

function clampScore(score) {
  const n = Number(score || 0);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function deriveTemperature(score) {
  if (score >= 80) return 'caliente';
  if (score >= 55) return 'calificado';
  if (score >= 30) return 'tibio';
  return 'frio';
}

const ai = ensureObject(aiRaw.output || aiRaw.text || aiRaw);
const extracted = ai.extracted_data || {};
const readiness = ai.readiness_flags || {};
const missing = Array.isArray(ai.missing_fields) ? ai.missing_fields : [];

let leadScore = clampScore(ai.lead_score);
let leadTemperature = ai.lead_temperature || deriveTemperature(leadScore);

const criticalMissingCount = [
  !readiness.has_budget,
  !readiness.has_zone,
  !readiness.has_payment_method,
  !readiness.accepted_next_step,
].filter(Boolean).length;

if (leadTemperature === 'caliente' && criticalMissingCount >= 2) {
  leadTemperature = 'calificado';
  leadScore = Math.min(79, leadScore);
}

if (!($json.phone || extracted.phone || $json.email)) {
  if (ai.next_best_action === 'derivar_asesor') {
    ai.next_best_action = 'pedir_datos';
  }
}

return [
  {
    json: {
      ...$json,
      ...ai,
      extracted_data: {
        lead_name: extracted.lead_name || $json.lead_name || null,
        operation_type: extracted.operation_type || null,
        property_type: extracted.property_type || null,
        preferred_zones: extracted.preferred_zones || [],
        city: extracted.city || null,
        bedrooms: extracted.bedrooms ?? null,
        budget_amount: extracted.budget_amount ?? null,
        budget_currency: extracted.budget_currency || null,
        payment_method: extracted.payment_method || null,
        urgency_level: extracted.urgency_level || null,
        timeframe_days: extracted.timeframe_days ?? null,
        property_ref: extracted.property_ref || $json.property_ref || null,
        investment_goal: extracted.investment_goal || null,
      },
      missing_fields: missing,
      lead_score: leadScore,
      lead_temperature: leadTemperature,
      customer_message: ai.customer_message || 'Gracias por escribirnos. Contame un poco mas de tu busqueda y te ayudo a filtrarla rapido.',
      advisor_summary: ai.advisor_summary || 'Lead analizado automaticamente. Revisar detalle.',
      disqualification_reason: ai.disqualification_reason || null,
    },
  },
];


// Nodo Code: Build Follow-up Timing
// Entrada esperada: lead enriquecido luego de mensajeria
const lead = $input.first().json;

const mapHours = {
  frio: 24,
  tibio: 24,
  calificado: 48,
  caliente: 2,
};

const followupHours = lead.followup_plan?.followup_in_hours ?? mapHours[lead.lead_temperature] ?? 24;
const scheduledAt = new Date(Date.now() + followupHours * 60 * 60 * 1000).toISOString();

return [
  {
    json: {
      ...lead,
      should_schedule_followup: lead.followup_plan?.should_schedule_followup ?? true,
      followup_type: lead.followup_plan?.followup_type || `seguimiento_${followupHours}h`,
      followup_in_hours: followupHours,
      scheduled_at: scheduledAt,
    },
  },
];
