import type { Lead } from '../../shared/types/lead';
import { CANAL_LABEL } from '../../shared/lib/labels';
import {
  buildCatchUpReport,
  seedActivityFromLeads,
} from './assistantCatchUp';
import { getAssistantActivity, type AssistantActivityItem } from './assistantActivity';
import { getCatchUpSinceIso } from './assistantSession';

function canalLabel(canal: string): string {
  const key = canal.toLowerCase();
  if (key === 'telegram') return 'Telegram';
  if (key === 'whatsapp') return 'WhatsApp';
  if (key === 'messenger') return 'Messenger';
  return canal || 'chat';
}

/** Contexto reciente para Groq: Telegram, WhatsApp y actividad del panel. */
export function buildLiveContext(leads: Lead[]): string {
  const since = getCatchUpSinceIso();
  seedActivityFromLeads(leads, since, undefined);

  const report = buildCatchUpReport(leads, since);
  const activity = getAssistantActivity(10);
  const activityLines = activity.map((a) => formatActivityLine(a));

  const lines = [...activityLines];
  const unique = [...new Set(lines)].slice(0, 12);

  const summaryParts: string[] = [];
  if (report.clientCount > 0) {
    summaryParts.push(
      `Mensajes de clientes desde última sesión: ${report.clientCount}.`,
    );
    const tg = report.byCanal.telegram ?? 0;
    const wa = report.byCanal.whatsapp ?? 0;
    if (tg || wa) {
      summaryParts.push(`Telegram: ${tg}, WhatsApp: ${wa}.`);
    }
  }
  if (report.urgentLeads.length > 0) {
    summaryParts.push(
      `Calientes pendientes: ${report.urgentLeads.map((l) => l.nombre).join(', ')}.`,
    );
  }

  if (!unique.length && !summaryParts.length) {
    return 'Sin actividad nueva en canales. Datos del panel sincronizados.';
  }

  return [...summaryParts, ...unique].join('\n');
}

function formatActivityLine(a: AssistantActivityItem): string {
  const who = a.side === 'client' ? a.leadName : 'bot';
  const canal = canalLabel(a.canal);
  const src = a.source === 'sheets' ? '' : '';
  return `- [${canal}] ${who}: ${a.preview.slice(0, 120)}${src}`;
}

function collectRecentMessages(leads: Lead[], limit: number): string[] {
  const rows: { at: string; line: string }[] = [];

  for (const lead of leads) {
    const canal = canalLabel(lead.canalOrigen);
    const hist = lead.historial ?? [];
    for (let i = hist.length - 1; i >= 0 && i >= hist.length - 3; i -= 1) {
      const m = hist[i];
      const client = m.mensajeCliente?.trim();
      const bot = m.respuestaBot?.trim();
      const at = m.fecha || lead.ultimaActualizacion;
      if (client) {
        rows.push({
          at,
          line: `- [${canal}] ${lead.nombre || 'Cliente'}: ${client.slice(0, 100)}`,
        });
      }
      if (bot) {
        rows.push({
          at,
          line: `- [${canal}] Bot a ${lead.nombre || 'cliente'}: ${bot.slice(0, 80)}`,
        });
      }
    }
  }

  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return rows.slice(0, limit).map((r) => r.line);
}

export function lastClientMessage(
  leads: Lead[],
  canalFilter?: string,
): { lead: Lead; text: string; canal: string } | null {
  let best: { lead: Lead; text: string; canal: string; at: string } | null = null;

  for (const lead of leads) {
    if (canalFilter && lead.canalOrigen !== canalFilter) continue;
    const hist = lead.historial ?? [];
    for (let i = hist.length - 1; i >= 0; i -= 1) {
      const text = hist[i]?.mensajeCliente?.trim();
      if (!text) continue;
      const at = hist[i]?.fecha || lead.ultimaActualizacion;
      if (!best || at > best.at) {
        best = {
          lead,
          text,
          canal: lead.canalOrigen,
          at,
        };
      }
      break;
    }
  }

  if (!best) return null;
  return { lead: best.lead, text: best.text, canal: best.canal };
}

export function formatCanalName(canal: string): string {
  const key = canal as keyof typeof CANAL_LABEL;
  if (CANAL_LABEL[key]) return CANAL_LABEL[key];
  return canalLabel(canal);
}

export { collectRecentMessages };
