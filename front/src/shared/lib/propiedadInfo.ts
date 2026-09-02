/** Extrae dirección / highlights útiles desde descripción CSV o media. */

const HIGHLIGHT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bapto\s*cr[eé]dito\b/i, label: 'Apto crédito' },
  { re: /\bamenities?\b/i, label: 'Amenities' },
  { re: /\bcochera\b/i, label: 'Cochera' },
  { re: /\bgarage|garaje\b/i, label: 'Garage' },
  { re: /\bbalc[oó]n\b/i, label: 'Balcón' },
  { re: /\bterraza\b/i, label: 'Terraza' },
  { re: /\bpileta|piscina\b/i, label: 'Pileta' },
  { re: /\bparrilla|quincho\b/i, label: 'Parrilla' },
  { re: /\bpatio\b/i, label: 'Patio' },
  { re: /\bjard[ií]n\b/i, label: 'Jardín' },
  { re: /\bluminoso\b/i, label: 'Luminoso' },
  { re: /\bvista\b/i, label: 'Vista' },
  { re: /\bsin\s*expensas\b/i, label: 'Sin expensas' },
  { re: /\bbajo\s*expensas\b/i, label: 'Bajo expensas' },
  { re: /\bsum\b/i, label: 'SUM' },
  { re: /\bbarrio\s*cerrado\b/i, label: 'Barrio cerrado' },
  { re: /\bport[oó]n\s*autom[aá]tico|port\s*automatico\b/i, label: 'Portón automático' },
  { re: /\bcubierta\b/i, label: 'Cubierta' },
  { re: /\bdoble\s*altura\b/i, label: 'Doble altura' },
  { re: /\bvidriera\b/i, label: 'Vidriera' },
  { re: /\bsemipiso\b/i, label: 'Semipiso' },
  { re: /\bcontrafrente\b/i, label: 'Contrafrente' },
  { re: /\bideal\s*renta\b/i, label: 'Ideal renta' },
];

export function splitDescripcion(raw: string | undefined): {
  principal: string;
  extras: string[];
} {
  const parts = String(raw ?? '')
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    principal: parts[0] ?? '',
    extras: parts.slice(1),
  };
}

/** Heurística liviana: calle + número al inicio de la descripción. */
export function extractDireccion(descripcion: string | undefined): string {
  const { principal } = splitDescripcion(descripcion);
  if (!principal) return '';
  const m = principal.match(
    /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ.\s]+?\s+\d+[A-Za-z]?|(?:Av\.?|Calle|Bv\.?|Boulevard)\s+[^,|]{4,40})/i,
  );
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  // Fallback: primeras 3–5 palabras si hay un número cerca
  if (/\d/.test(principal.slice(0, 48))) {
    const words = principal.split(/\s+/).slice(0, 5);
    return words.join(' ');
  }
  return '';
}

export function extractHighlights(
  descripcion: string | undefined,
  extrasFromMedia?: string[],
  tipo?: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (label: string) => {
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    out.push(label);
  };

  for (const x of extrasFromMedia ?? []) push(x.trim());

  const { principal, extras } = splitDescripcion(descripcion);
  for (const extra of extras) push(extra);

  const haystack = `${tipo ?? ''} ${principal} ${extras.join(' ')}`;
  for (const { re, label } of HIGHLIGHT_PATTERNS) {
    if (re.test(haystack)) push(label);
  }
  return out.slice(0, 10);
}

export function formatPrecioUsd(precioUsd: number | undefined, precio: string): string {
  if (typeof precioUsd === 'number' && Number.isFinite(precioUsd) && precioUsd > 0) {
    return `USD ${precioUsd.toLocaleString('es-AR')}`;
  }
  return precio || 'Precio sin cargar';
}
