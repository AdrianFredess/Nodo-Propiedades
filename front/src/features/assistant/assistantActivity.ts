/** Buffer de actividad (Telegram, WhatsApp, panel) para el Asistente. */

export interface AssistantActivityItem {
  at: string;
  type: 'chat.message' | 'lead.updated' | 'leads.refresh';
  canal: string;
  leadId?: string;
  leadName: string;
  side: 'client' | 'bot' | 'system';
  preview: string;
  source?: string;
}

const MAX_ITEMS = 60;
const STORAGE_KEY = 'asistente-activity-buffer';

function loadPersisted(): AssistantActivityItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object')
      .slice(0, MAX_ITEMS) as AssistantActivityItem[];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    /* ignore quota */
  }
}

let buffer: AssistantActivityItem[] = loadPersisted();
const listeners = new Set<(item: AssistantActivityItem) => void>();

export function pushAssistantActivity(item: AssistantActivityItem): void {
  buffer = [item, ...buffer].slice(0, MAX_ITEMS);
  persist();
  for (const fn of listeners) fn(item);
}

export function getAssistantActivity(limit = 12): AssistantActivityItem[] {
  return buffer.slice(0, limit);
}

export function getActivityDedupeKeys(): Set<string> {
  return new Set(
    buffer.map(
      (item) =>
        `${item.leadId ?? ''}|${item.at}|${item.side}|${item.preview.slice(0, 48)}`,
    ),
  );
}

export function onAssistantActivity(
  fn: (item: AssistantActivityItem) => void,
): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearAssistantActivity(): void {
  buffer = [];
  persist();
}
