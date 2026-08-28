import type { Lead } from '../../shared/types/lead';
import { CANAL_LABEL } from '../../shared/lib/labels';
import {
  pushAssistantActivity,
  type AssistantActivityItem,
} from './assistantActivity';
import { getCatchUpSinceIso, parseEventAt } from './assistantSession';
import { leadsToContact } from './buildReply';

function formatCanalName(canal: string): string {
  const key = canal as keyof typeof CANAL_LABEL;
  if (CANAL_LABEL[key]) return CANAL_LABEL[key];
  const c = canal.toLowerCase();
  if (c === 'telegram') return 'Telegram';
  if (c === 'whatsapp') return 'WhatsApp';
  if (c === 'messenger') return 'Messenger';
  return canal || 'chat';
}

export interface TimelineEvent {
  at: string;
  atMs: number;
  leadId: string;
  leadName: string;
  canal: string;
  side: 'client' | 'bot';
  text: string;
}

export interface CatchUpReport {
  sinceIso: string;
  clientCount: number;
  botCount: number;
  byCanal: Record<string, number>;
  highlights: TimelineEvent[];
  urgentLeads: Lead[];
  updatedLeadCount: number;
  hasNews: boolean;
}

function canalKey(canal: string): string {
  const c = canal.toLowerCase();
  if (c.includes('telegram')) return 'telegram';
  if (c.includes('whatsapp')) return 'whatsapp';
  if (c.includes('messenger')) return 'messenger';
  return c || 'otro';
}

function activityDedupeKey(item: {
  leadId?: string;
  at: string;
  side: string;
  preview: string;
}): string {
  return `${item.leadId ?? ''}|${item.at}|${item.side}|${item.preview.slice(0, 48)}`;
}

export function collectTimelineEvents(leads: Lead[]): TimelineEvent[] {
  const rows: TimelineEvent[] = [];

  for (const lead of leads) {
    const canal = lead.canalOrigen || 'telegram';
    const hist = lead.historial ?? [];
    for (const m of hist) {
      const at = m.fecha || lead.ultimaActualizacion;
      const atMs = parseEventAt(at);
      const client = m.mensajeCliente?.trim();
      const bot = m.respuestaBot?.trim();
      if (client) {
        rows.push({
          at,
          atMs,
          leadId: lead.id,
          leadName: lead.nombre || 'Cliente',
          canal: m.canal || canal,
          side: 'client',
          text: client,
        });
      }
      if (bot) {
        rows.push({
          at,
          atMs,
          leadId: lead.id,
          leadName: lead.nombre || 'Cliente',
          canal: m.canal || canal,
          side: 'bot',
          text: bot,
        });
      }
    }
  }

  rows.sort((a, b) => b.atMs - a.atMs);
  return rows;
}

export function buildCatchUpReport(
  leads: Lead[],
  sinceIso?: string,
): CatchUpReport {
  const since = sinceIso ?? getCatchUpSinceIso();
  const sinceMs = parseEventAt(since);
  const events = collectTimelineEvents(leads).filter((e) => e.atMs >= sinceMs);

  const clientEvents = events.filter((e) => e.side === 'client');
  const botCount = events.filter((e) => e.side === 'bot').length;
  const byCanal: Record<string, number> = {};

  for (const e of clientEvents) {
    const key = canalKey(e.canal);
    byCanal[key] = (byCanal[key] ?? 0) + 1;
  }

  const updatedLeadCount = leads.filter(
    (l) => parseEventAt(l.ultimaActualizacion) >= sinceMs,
  ).length;

  const urgentLeads = leadsToContact(leads).filter((l) => {
    const lastClient = [...(l.historial ?? [])]
      .reverse()
      .find((m) => m.mensajeCliente?.trim());
    if (!lastClient) return false;
    return parseEventAt(lastClient.fecha || l.ultimaActualizacion) >= sinceMs;
  });

  const hasNews =
    clientEvents.length > 0 ||
    urgentLeads.length > 0 ||
    updatedLeadCount > 0;

  return {
    sinceIso: since,
    clientCount: clientEvents.length,
    botCount,
    byCanal,
    highlights: clientEvents.slice(0, 6),
    urgentLeads: urgentLeads.slice(0, 4),
    updatedLeadCount,
    hasNews,
  };
}

/** Carga historial de Sheets/Telegram al buffer del asistente (sin depender del WS). */
export function seedActivityFromLeads(
  leads: Lead[],
  sinceIso?: string,
  existingKeys?: Set<string>,
): number {
  const since = sinceIso ?? getCatchUpSinceIso();
  const sinceMs = parseEventAt(since);
  const known = existingKeys ?? new Set<string>();
  let added = 0;

  for (const event of collectTimelineEvents(leads)) {
    if (event.atMs < sinceMs) continue;
    const item: AssistantActivityItem = {
      at: event.at,
      type: 'chat.message',
      canal: event.canal,
      leadId: event.leadId,
      leadName: event.leadName,
      side: event.side,
      preview: event.text.slice(0, 160),
      source: 'sheets',
    };
    const key = activityDedupeKey(item);
    if (known.has(key)) continue;
    known.add(key);
    pushAssistantActivity(item);
    added += 1;
  }

  return added;
}

function canalCountLine(byCanal: Record<string, number>): string {
  const parts: string[] = [];
  if (byCanal.telegram) parts.push(`${byCanal.telegram} por Telegram`);
  if (byCanal.whatsapp) parts.push(`${byCanal.whatsapp} por WhatsApp`);
  if (byCanal.messenger) parts.push(`${byCanal.messenger} por Messenger`);
  return parts.join(', ');
}

export function catchUpSpeech(report: CatchUpReport): string {
  if (!report.hasNews) {
    return 'Revisé Telegram, WhatsApp y el panel. No hay nada nuevo desde la última vez.';
  }

  const parts: string[] = [];

  if (report.clientCount > 0) {
    const canalLine = canalCountLine(report.byCanal);
    parts.push(
      `${report.clientCount} mensaje${report.clientCount === 1 ? '' : 's'} de clientes${canalLine ? ` (${canalLine})` : ''}.`,
    );
  } else if (report.updatedLeadCount > 0) {
    parts.push(
      `${report.updatedLeadCount} lead${report.updatedLeadCount === 1 ? '' : 's'} con movimiento en el panel.`,
    );
  }

  const top = report.highlights[0];
  if (top) {
    parts.push(
      `Último: ${top.leadName} por ${formatCanalName(top.canal)} — "${top.text.slice(0, 85)}".`,
    );
  }

  if (report.urgentLeads.length > 0) {
    const names = report.urgentLeads
      .slice(0, 3)
      .map((l) => l.nombre || 'Cliente')
      .join(', ');
    parts.push(
      `${report.urgentLeads.length} caliente${report.urgentLeads.length === 1 ? '' : 's'} esperan seguimiento: ${names}.`,
    );
  }

  return parts.join(' ').trim();
}

export function catchUpDetailSpeech(report: CatchUpReport): string {
  const base = catchUpSpeech(report);
  const extra = report.highlights
    .slice(1, 4)
    .map(
      (h) =>
        `${h.leadName} (${formatCanalName(h.canal)}): "${h.text.slice(0, 70)}"`,
    );
  if (!extra.length) return base;
  return `${base} También: ${extra.join('; ')}.`;
}
