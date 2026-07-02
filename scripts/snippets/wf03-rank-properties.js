const lead = $('Execute Workflow Trigger').first().json;
const items = $input.all().map(i => i.json);

const extractedData = lead.extracted_data || lead.known_profile || {};
const rawZones = extractedData.preferred_zones || lead.preferred_zones || [];
const zones = (Array.isArray(rawZones) ? rawZones : String(rawZones).split(','))
  .map(z => String(z).toLowerCase().trim())
  .filter(Boolean);

const budget = Number(extractedData.budget_amount || lead.budget_amount || 0);
const currency = (extractedData.budget_currency || lead.budget_currency || 'USD').toUpperCase();
const propertyType = String(extractedData.property_type || lead.property_type || '').toLowerCase();
const operationType = String(extractedData.operation_type || lead.operation_type || '').toLowerCase();
const bedrooms = Number(extractedData.bedrooms || lead.bedrooms || 0);
const urgency = String(extractedData.urgency_level || lead.urgency_level || 'media').toLowerCase();
const propertyRef = String(extractedData.property_ref || lead.property_ref || '').toLowerCase();
const paymentMethod = String(extractedData.payment_method || lead.payment_method || '').toLowerCase();

const deltaPct = urgency === 'alta' ? 0.20 : urgency === 'baja' ? 0.10 : 0.15;

function normalize(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim();
}

function fuzzyZoneMatch(propZone, leadZones) {
  if (!leadZones.length) return false;
  const normProp = normalize(propZone);
  return leadZones.some(z => {
    const normLead = normalize(z);
    if (normProp.includes(normLead) || normLead.includes(normProp)) return true;
    if (normLead.length >= 5 && normProp.startsWith(normLead.slice(0, 5))) return true;
    return false;
  });
}

function scoreProperty(p) {
  let score = 0;

  if (!p.status || normalize(p.status) !== 'activo') return -999;

  if (propertyRef && (
    normalize(p.external_ref) === normalize(propertyRef) ||
    normalize(p.property_id) === normalize(propertyRef) ||
    normalize(p.title).includes(normalize(propertyRef))
  )) score += 60;

  if (zones.length && fuzzyZoneMatch(p.zone, zones)) score += 35;

  if (propertyType && normalize(p.property_type) === normalize(propertyType)) score += 20;

  if (operationType && normalize(p.operation_type) === normalize(operationType)) score += 10;

  const price = Number(p.price || 0);
  if (budget > 0 && currency === String(p.currency || '').toUpperCase()) {
    if (price >= budget * (1 - deltaPct) && price <= budget * (1 + deltaPct)) score += 20;
    else if (price <= budget) score += 10;
    else if (price > budget * (1 + deltaPct)) score -= 15;
  }

  const pBedrooms = Number(p.bedrooms || 0);
  if (bedrooms > 0) {
    if (pBedrooms === bedrooms) score += 15;
    else if (Math.abs(pBedrooms - bedrooms) === 1) score += 5;
  }

  if (currency && String(p.currency || '').toUpperCase() === currency) score += 5;

  const features = String(p.features || '').toLowerCase();
  if (paymentMethod.includes('credito')) {
    if (features.includes('apto credito') || features.includes('apto_credito')) score += 10;
  }
  if (paymentMethod.includes('contado')) {
    const payOpts = String(p.payment_options || '').toLowerCase();
    if (payOpts.includes('contado')) score += 8;
  }

  if (features.includes('balcon')) score += 3;
  if (features.includes('luminoso')) score += 2;
  if (features.includes('amenities')) score += 2;

  return score;
}

const matches = items
  .map(p => ({ ...p, _match_score: scoreProperty(p) }))
  .filter(p => p._match_score > 0)
  .sort((a, b) => b._match_score - a._match_score)
  .slice(0, 5)
  .map(({ _match_score, ...rest }) => ({ ...rest }));

const matchedSummary = matches.map(p => {
  const line = `${p.title || p.external_ref} | ${p.zone} | ${p.price} ${p.currency} | ${p.bedrooms}amb | ${p.publication_link || ''}`;
  return line.slice(0, 150);
}).join('\n');

return [{ json: {
  ...lead,
  matched_properties: matches,
  matched_properties_summary: matchedSummary,
  matched_count: matches.length
} }];
