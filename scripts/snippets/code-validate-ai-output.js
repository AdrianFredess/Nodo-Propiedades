const aiRaw = $input.first().json;
const ctx = $('Code - Build AI Context').first().json;
const sheetLead = $('Google Sheets - Lookup Lead').first().json;
const prev = { ...sheetLead, ...ctx };

let rawText = '';
if (typeof aiRaw.output === 'string') {
  rawText = aiRaw.output;
} else if (typeof aiRaw.output === 'object' && aiRaw.output !== null) {
  rawText = JSON.stringify(aiRaw.output);
} else {
  rawText = JSON.stringify(aiRaw);
}

const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) ||
                  rawText.match(/```\s*([\s\S]*?)```/) ||
                  rawText.match(/(\{[\s\S]*\})/);

let ai = {};
let parseError = false;
try {
  const clean = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
  ai = JSON.parse(clean);
} catch (e) {
  parseError = true;
  ai = {
    lead_intent: 'curious',
    buyer_profile: 'unknown',
    intent_confidence: 0,
    extracted_data: {
      lead_name: prev.lead_name || null,
      operation_type: null, property_type: null,
      preferred_zones: [], city: null, bedrooms: null,
      budget_amount: null, budget_currency: null,
      payment_method: null, urgency_level: null,
      timeframe_days: null, property_ref: null, investment_goal: null
    },
    missing_fields: ['parse_error'],
    lead_score: 0,
    lead_temperature: 'frio',
    readiness_flags: {
      has_budget: false, has_zone: false,
      has_payment_method: false, has_urgency: false, accepted_next_step: false
    },
    next_best_action: 'pedir_datos',
    followup_plan: { should_schedule_followup: true, followup_type: 'seguimiento_24h', followup_in_hours: 24 },
    customer_message: 'Gracias por escribirnos. Contame un poco más de lo que estás buscando y te ayudo enseguida.',
    advisor_summary: `ERROR de parseo del AI. Revisar manualmente. Mensaje: ${String(prev.message || '').slice(0, 200)}`,
    disqualification_reason: null
  };
}

const extracted = ai.extracted_data || {};
const readiness = ai.readiness_flags || {};

let leadScore = Math.max(0, Math.min(100, Math.round(Number(ai.lead_score || 0))));
let leadTemperature = ai.lead_temperature || 'frio';

const criticalMissingCount = [
  !readiness.has_budget, !readiness.has_zone,
  !readiness.has_payment_method, !readiness.accepted_next_step
].filter(Boolean).length;

if (leadTemperature === 'caliente' && criticalMissingCount >= 2) {
  leadTemperature = 'calificado';
  leadScore = Math.min(79, leadScore);
}

const hasContact = !!(prev.normalized_phone || prev.phone || prev.normalized_email || prev.email);
let nextAction = ai.next_best_action || 'pedir_datos';
if (nextAction === 'derivar_asesor' && !hasContact) {
  nextAction = 'pedir_datos';
}

return [{ json: {
  ...prev,
  ...ai,
  extracted_data: {
    lead_name: extracted.lead_name || prev.lead_name || null,
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
    property_ref: extracted.property_ref || prev.property_ref || null,
    investment_goal: extracted.investment_goal || null
  },
  missing_fields: ai.missing_fields || [],
  lead_score: leadScore,
  lead_temperature: leadTemperature,
  next_best_action: nextAction,
  customer_message: (ai.customer_message || '').slice(0, 300) ||
    'Gracias por escribirnos. Contame un poco más de tu búsqueda.',
  advisor_summary: (ai.advisor_summary || '').slice(0, 500) ||
    'Lead analizado automáticamente. Revisar detalle.',
  ai_parse_error: parseError
} }];
