const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Parseo robusto de fechas de Sheets / n8n / Excel.
 * Soporta ISO, "yyyy-MM-dd HH:mm", dd/MM/yyyy, serial Excel.
 */
export function parseDate(value: string | number | null | undefined): Date | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial (días desde 1899-12-30)
    if (value > 20000 && value < 80000) {
      const ms = Math.round((value - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // yyyy-MM-dd HH:mm(:ss)?  → tratar como local AR-friendly
  const localMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (localMatch) {
    const [, y, m, d, hh, mm, ss] = localMatch;
    const dt = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || '0'),
    );
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // dd/MM/yyyy[ HH:mm]
  const dmy = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (dmy) {
    const [, d, m, y, hh, mm, ss] = dmy;
    const dt = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh || '0'),
      Number(mm || '0'),
      Number(ss || '0'),
    );
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // ISO / Date.parse (reemplazar espacio por T ayuda en algunos engines)
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  const d2 = new Date(raw);
  return Number.isNaN(d2.getTime()) ? null : d2;
}

export function relativeTimeFrom(value: string, now = new Date()): string {
  const d = parseDate(value);
  if (!d) return 'Sin fecha';
  const diff = now.getTime() - d.getTime();
  if (diff < 0) return 'Ahora';
  if (diff < MINUTE) return 'Hace un momento';
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `Hace ${m} min`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `Hace ${h} h`;
  }
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  });
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isWithinLastDays(value: string, days: number, now = new Date()): boolean {
  const d = parseDate(value);
  if (!d) return false;
  return now.getTime() - d.getTime() <= days * DAY;
}

export function formatDateTime(value: string): string {
  const d = parseDate(value);
  if (!d) return '—';
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Hora corta 24h para burbujas (ej. 14:35). Nunca am/pm. */
export function formatChatTime(value: string, withSeconds = false): string {
  const d = parseDate(value);
  if (!d) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (!withSeconds) return `${hh}:${mm}`;
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Separador de día en el hilo (Hoy / Ayer / fecha). */
export function formatChatDayLabel(value: string, now = new Date()): string {
  const d = parseDate(value);
  if (!d) return '';
  if (isSameDay(d, now)) return 'Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Ayer';
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
