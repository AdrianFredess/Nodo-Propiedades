import {
  computeResumenMetrics,
  filterLeadsByDay,
} from '../resumen/computeMetrics';
import type { Lead } from '../../shared/types/lead';
import { sortLeadsByRecency } from '../../shared/lib/leadsOrder';
import type { AssistantIntent, AssistantReply } from './assistantTypes';
import { parseLocalIntent } from './localIntents';
import {
  buildCatchUpReport,
  catchUpDetailSpeech,
  seedActivityFromLeads,
} from './assistantCatchUp';
import { getCatchUpSinceIso } from './assistantSession';
import { formatCanalName, lastClientMessage } from './assistantContext';

function formatLeadLine(lead: Lead): string {
  const parts = [
    lead.nombre || 'Sin nombre',
    lead.zona || null,
    lead.presupuesto ? `presupuesto ${lead.presupuesto}` : null,
    lead.temperatura === 'caliente' ? 'caliente' : null,
  ].filter(Boolean);
  return parts.join(', ');
}

function yesterdayDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function leadsToContact(leads: Lead[]): Lead[] {
  return sortLeadsByRecency(
    leads.filter((l) => {
      if (l.temperatura !== 'caliente') return false;
      const seg = l.estadoSeguimiento;
      return seg !== 'respondido' && seg !== 'cerrado';
    }),
  ).slice(0, 8);
}

export function buildReplyFromIntent(
  intent: AssistantIntent,
  leads: Lead[],
): AssistantReply {
  switch (intent.kind) {
    case 'navigate':
      return {
        speech: navigateSpeech(intent.path),
        actions: [{ type: 'navigate', path: intent.path }],
      };
    case 'open_lead':
      return {
        speech: `Te abro la ficha de ${intent.leadName}.`,
        actions: [
          {
            type: 'navigate',
            path: `/leads/${encodeURIComponent(intent.leadId)}`,
          },
          { type: 'open_lead', leadId: intent.leadId },
        ],
        leads: leads.filter((l) => l.id === intent.leadId),
      };
    case 'summary_yesterday':
      return buildYesterdaySummary(leads);
    case 'summary_today':
      return buildTodaySummary(leads);
    case 'who_to_contact':
      return buildWhoToContact(leads);
    case 'stats_overview':
      return buildStatsOverview(leads);
    case 'recent_activity':
      return buildRecentActivity(leads);
    case 'catch_up':
      return buildCatchUpReply(leads);
    case 'help':
      return buildHelpReply();
    default:
      return {
        speech:
          'No te capté. Probá: catálogo, resumen de ayer, a quién contactar, o ayuda.',
        actions: [],
      };
  }
}

function navigateSpeech(path: string): string {
  if (path === '/catalogo') return 'Te abro el catálogo.';
  if (path === '/pipeline') return 'Vamos al pipeline.';
  if (path === '/') return 'Te llevo al resumen.';
  return 'Listo.';
}

function buildYesterdaySummary(leads: Lead[]): AssistantReply {
  const day = yesterdayDate();
  const active = filterLeadsByDay(leads, day);
  const metrics = computeResumenMetrics(active, day);
  const calientes = active.filter((l) => l.temperatura === 'caliente');
  const contact = leadsToContact(calientes.length ? calientes : active);

  let speech: string;
  if (active.length === 0) {
    speech =
      'Ayer no hubo movimientos nuevos en el panel. Si hubo charlas por fuera del bot, acá no las veo.';
  } else {
    const lines = contact.slice(0, 3).map((l) => formatLeadLine(l));
    speech = [
      `Ayer: ${active.length} lead${active.length === 1 ? '' : 's'} con actividad.`,
      `${metrics.porTemperatura.caliente} caliente${metrics.porTemperatura.caliente === 1 ? '' : 's'}, ${metrics.porTemperatura.tibio} tibio${metrics.porTemperatura.tibio === 1 ? '' : 's'}.`,
      lines.length ? `Urgentes: ${lines.join('; ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return {
    speech,
    actions: contact[0]
      ? [
          {
            type: 'navigate',
            path: `/leads/${encodeURIComponent(contact[0].id)}`,
          },
        ]
      : [{ type: 'navigate', path: '/pipeline' }],
    leads: contact,
  };
}

function buildTodaySummary(leads: Lead[]): AssistantReply {
  const today = new Date();
  const active = filterLeadsByDay(leads, today);
  const metrics = computeResumenMetrics(active, today);
  const top = sortLeadsByRecency(active).slice(0, 3);

  let speech: string;
  if (active.length === 0) {
    speech =
      'Hoy todavía no hay actividad registrada. El tablero está tranquilo por ahora.';
  } else {
    const names = top.map((l) => l.nombre || 'Sin nombre').join(', ');
    speech = [
      `Hoy: ${active.length} con movimiento.`,
      `${metrics.porTemperatura.caliente} caliente${metrics.porTemperatura.caliente === 1 ? '' : 's'}.`,
      names ? `Recientes: ${names}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return {
    speech,
    actions: [{ type: 'navigate', path: '/' }],
    leads: top,
  };
}

function buildWhoToContact(leads: Lead[]): AssistantReply {
  const contact = leadsToContact(leads);

  if (contact.length === 0) {
    return {
      speech:
        'Por ahora no tenés calientes pendientes de seguimiento. Si querés, mirá tibios en el pipeline.',
      actions: [{ type: 'navigate', path: '/pipeline' }],
      leads: [],
    };
  }

  const lines = contact.slice(0, 4).map((l) => formatLeadLine(l));
  const speech = `Escribí primero a ${lines.join('; ')}.`;

  return {
    speech,
    actions: [
      {
        type: 'navigate',
        path: `/leads/${encodeURIComponent(contact[0].id)}`,
      },
    ],
    leads: contact,
  };
}

function buildStatsOverview(leads: Lead[]): AssistantReply {
  const calientes = leads.filter((l) => l.temperatura === 'caliente');
  const pendientes = leadsToContact(leads);
  const speech = [
    `${leads.length} leads en total.`,
    `${calientes.length} caliente${calientes.length === 1 ? '' : 's'}.`,
    pendientes.length
      ? `${pendientes.length} esperando seguimiento.`
      : 'Sin pendientes urgentes.',
  ].join(' ');

  return {
    speech,
    actions: [{ type: 'navigate', path: '/pipeline' }],
    leads: pendientes.slice(0, 4),
  };
}

function buildCatchUpReply(leads: Lead[]): AssistantReply {
  const since = getCatchUpSinceIso();
  seedActivityFromLeads(leads, since);
  const report = buildCatchUpReport(leads, since);
  const speech = catchUpDetailSpeech(report);
  const topLeadId =
    report.urgentLeads[0]?.id ?? report.highlights[0]?.leadId;

  return {
    speech,
    actions: topLeadId
      ? [
          {
            type: 'navigate',
            path: `/leads/${encodeURIComponent(topLeadId)}`,
          },
        ]
      : [{ type: 'navigate', path: '/pipeline' }],
    leads: report.urgentLeads.length
      ? report.urgentLeads
      : topLeadId
        ? leads.filter((l) => l.id === topLeadId)
        : [],
  };
}

function buildRecentActivity(leads: Lead[]): AssistantReply {
  const tg = lastClientMessage(leads, 'telegram');
  const wa = lastClientMessage(leads, 'whatsapp');
  const any = lastClientMessage(leads);

  const pick = tg ?? wa ?? any;
  if (!pick) {
    return {
      speech:
        'Todavía no veo mensajes recientes en Telegram ni WhatsApp. Si el WebSocket está vivo, te aviso al instante cuando entre algo.',
      actions: [{ type: 'navigate', path: '/pipeline' }],
      leads: [],
    };
  }

  const canal = formatCanalName(pick.canal);
  const speech = `Último por ${canal}: ${pick.lead.nombre}, "${pick.text.slice(0, 90)}".`;

  return {
    speech,
    actions: [
      {
        type: 'navigate',
        path: `/leads/${encodeURIComponent(pick.lead.id)}`,
      },
    ],
    leads: [pick.lead],
  };
}

function buildHelpReply(): AssistantReply {
  return {
    speech:
      'Decime: catálogo, pipeline, resumen de ayer o hoy, a quién contactar, qué pasó en Telegram, poneme al día, o abrí un lead por nombre.',
    actions: [],
  };
}

export function processAssistantCommand(
  rawInput: string,
  leads: Lead[],
): { reply: AssistantReply; intent: AssistantIntent } {
  const intent = parseLocalIntent(rawInput, leads);
  const reply = buildReplyFromIntent(intent, leads);
  return { reply, intent };
}
