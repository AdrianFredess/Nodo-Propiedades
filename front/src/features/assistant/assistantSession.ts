const LAST_SEEN_KEY = 'asistente-last-seen';
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export function parseEventAt(raw: string): number {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 0;
  const iso = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export function getLastSeenAt(): string | null {
  try {
    const v = localStorage.getItem(LAST_SEEN_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function markAssistantSeen(at = new Date().toISOString()): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, at);
  } catch {
    /* ignore */
  }
}

/** Desde cuándo analizar actividad (última vez visto o 24 h). */
export function getCatchUpSinceIso(): string {
  const last = getLastSeenAt();
  const floor = Date.now() - MAX_LOOKBACK_MS;
  if (last) {
    const t = Math.max(parseEventAt(last), floor);
    return new Date(t).toISOString();
  }
  return new Date(Date.now() - DEFAULT_LOOKBACK_MS).toISOString();
}

export function msSinceLastSeen(): number | null {
  const last = getLastSeenAt();
  if (!last) return null;
  const t = parseEventAt(last);
  if (!t) return null;
  return Date.now() - t;
}
