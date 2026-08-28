import type { Lead } from '../../shared/types/lead';
import type { AssistantIntent } from './assistantTypes';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\sáéíóúüñ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export function parseLocalIntent(
  rawInput: string,
  leads: Lead[],
): AssistantIntent {
  const text = normalize(rawInput);
  if (!text) return { kind: 'unknown', raw: rawInput };

  if (
    includesAny(text, [
      'que me perdi',
      'qué me perdí',
      'que perdi',
      'qué perdí',
      'poneme al dia',
      'poneme al día',
      'ponme al dia',
      'ponme al día',
      'mientras estaba apagado',
      'mientras no estaba',
      'estuve afuera',
      'sincroniza',
      'sincronizá',
      'estudio completo',
      'que paso mientras',
      'qué pasó mientras',
    ])
  ) {
    return { kind: 'catch_up' };
  }

  if (
    includesAny(text, [
      'ayuda',
      'comandos',
      'que puedo',
      'qué puedo',
      'que sabes',
      'qué sabes',
      'como funciona',
      'cómo funciona',
    ])
  ) {
    return { kind: 'help' };
  }

  if (
    includesAny(text, [
      'que paso',
      'qué pasó',
      'novedades',
      'ultimo mensaje',
      'último mensaje',
      'que hay de nuevo',
      'qué hay de nuevo',
      'actividad reciente',
    ]) ||
    (includesAny(text, ['telegram', 'whatsapp']) &&
      includesAny(text, [
        'mensaje',
        'escribio',
        'escribió',
        'ultimo',
        'último',
        'paso',
        'pasó',
      ]))
  ) {
    return { kind: 'recent_activity' };
  }

  if (includesAny(text, ['ayer', 'de ayer', 'el dia anterior'])) {
    return { kind: 'summary_yesterday' };
  }

  if (includesAny(text, ['hoy', 'de hoy']) && includesAny(text, ['resumen', 'como va', 'cómo va', 'actividad'])) {
    return { kind: 'summary_today' };
  }

  if (
    includesAny(text, [
      'a quien le',
      'a quién le',
      'a quien tengo',
      'a quién tengo',
      'quien contactar',
      'quién contactar',
      'quienes contactar',
      'quiénes contactar',
      'prioridad hoy',
      'urgente hoy',
    ]) ||
    (includesAny(text, ['hablar', 'contactar', 'escribir']) &&
      includesAny(text, ['quien', 'quién', 'primero', 'tengo']))
  ) {
    return { kind: 'who_to_contact' };
  }

  if (
    includesAny(text, [
      'cuantos leads',
      'cuántos leads',
      'estado del panel',
      'panorama',
      'como estamos',
      'cómo estamos',
      'numeros generales',
      'números generales',
    ])
  ) {
    return { kind: 'stats_overview' };
  }

  if (
    includesAny(text, [
      'catalogo',
      'mostrar catalogo',
      'mostra catalogo',
      'abrir catalogo',
      'ver catalogo',
      'propiedades',
      'stock',
    ])
  ) {
    return { kind: 'navigate', path: '/catalogo' };
  }

  if (
    includesAny(text, [
      'pipeline',
      'embudo',
      'tablero',
      'kanban',
    ]) ||
    (includesAny(text, ['leads', 'clientes']) &&
      !includesAny(text, ['resumen', 'ayer', 'hoy', 'hablar', 'contactar', 'cuantos', 'cuántos']))
  ) {
    return { kind: 'navigate', path: '/pipeline' };
  }

  if (
    includesAny(text, ['resumen', 'inicio', 'home', 'dashboard']) &&
    !includesAny(text, ['ayer', 'hoy'])
  ) {
    return { kind: 'navigate', path: '/' };
  }

  if (includesAny(text, ['hoy', 'de hoy'])) {
    return { kind: 'summary_today' };
  }

  const openLead = matchOpenLead(text, leads);
  if (openLead) return openLead;

  return { kind: 'unknown', raw: rawInput };
}

function matchOpenLead(text: string, leads: Lead[]): AssistantIntent | null {
  const patterns = [
    /(?:abri|abr|mostra|mostrar|ver|ir a|ficha de|lead de|cliente de|cliente)\s+(.+)/,
    /(?:abrir|mostrar)\s+(?:el\s+)?lead\s+(.+)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const query = m[1].replace(/^(el|la|de)\s+/, '').trim();
    const lead = findLeadByName(query, leads);
    if (lead) {
      return {
        kind: 'open_lead',
        leadId: lead.id,
        leadName: lead.nombre || query,
      };
    }
  }
  return null;
}

export function findLeadByName(query: string, leads: Lead[]): Lead | undefined {
  const q = normalize(query);
  if (!q) return undefined;

  const exact = leads.find((l) => normalize(l.nombre) === q);
  if (exact) return exact;

  const partial = leads.filter((l) => {
    const name = normalize(l.nombre);
    return name.includes(q) || q.includes(name);
  });
  if (partial.length === 1) return partial[0];

  const byToken = leads.filter((l) => {
    const tokens = normalize(l.nombre).split(' ');
    return tokens.some((t) => t.length > 2 && q.includes(t));
  });
  if (byToken.length === 1) return byToken[0];

  return undefined;
}
