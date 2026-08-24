import { useMemo, useState } from 'react';
import { BroadcastBar } from '../broadcast/BroadcastBar';
import { LeadCard } from './LeadCard';
import {
  CANAL_LABEL,
  PIPELINE_COLUMNA_LABEL,
} from '../../shared/lib/labels';
import { compareLeadsByRecency } from '../../shared/lib/leadsOrder';
import type {
  CanalOrigen,
  Lead,
  PipelineColumna,
} from '../../shared/types/lead';

interface PipelinePageProps {
  leads: Lead[];
  unreadByLead?: Map<string, number>;
}

const COLUMNS: PipelineColumna[] = [
  'conversando',
  'frio',
  'tibio',
  'caliente',
];

/** Orden de canal dentro de cada columna (mismo kanban). */
const CHANNEL_ORDER: CanalOrigen[] = ['telegram', 'whatsapp', 'messenger'];

function columnOf(lead: Lead): PipelineColumna {
  if (!lead.leadCompleto) return 'conversando';
  return lead.temperatura;
}

interface ChannelBlock {
  canal: CanalOrigen;
  leads: Lead[];
}

function blocksForColumn(leads: Lead[]): ChannelBlock[] {
  const blocks: ChannelBlock[] = [];
  for (const canal of CHANNEL_ORDER) {
    const subset = leads
      .filter((l) => l.canalOrigen === canal)
      .sort(compareLeadsByRecency);
    if (subset.length === 0) continue;
    blocks.push({ canal, leads: subset });
  }
  return blocks;
}

export function PipelinePage({ leads, unreadByLead }: PipelinePageProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map: Record<PipelineColumna, Lead[]> = {
      conversando: [],
      frio: [],
      tibio: [],
      caliente: [],
    };
    for (const lead of leads) {
      map[columnOf(lead)].push(lead);
    }
    return map;
  }, [leads]);

  function toggleSelect(leadId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  return (
    <div className="pipeline-page">
      <header className="page-head page-head--compact">
        <div>
          <h1>Pipeline de leads</h1>
          <p>
            #1 = más reciente. En cada columna: Telegram arriba, WhatsApp
            abajo. Solo scrollea cada columna.
          </p>
        </div>
      </header>

      <div className="kanban kanban--4 kanban--compact">
        {COLUMNS.map((col) => {
          const blocks = blocksForColumn(grouped[col]);
          let ordinal = 0;
          return (
            <section key={col} className="kanban__col panel-card">
              <div className="kanban__head">
                <div className="kanban__title">
                  <span className={`temp-dot temp-dot--${col}`} />
                  {PIPELINE_COLUMNA_LABEL[col]}
                </div>
                <span className="kanban__count">{grouped[col].length}</span>
              </div>
              <div className="kanban__scroll" role="list">
                {blocks.length === 0 ? (
                  <div className="empty-state empty-state--compact">
                    Sin leads
                  </div>
                ) : (
                  blocks.map((block) => (
                    <div
                      key={block.canal}
                      className={`kanban__channel kanban__channel--${block.canal}`}
                    >
                      <div className="kanban__channel-label">
                        {CANAL_LABEL[block.canal]}
                        <span>{block.leads.length}</span>
                      </div>
                      {block.leads.map((lead) => {
                        ordinal += 1;
                        return (
                          <LeadCard
                            key={lead.id}
                            lead={lead}
                            ordinal={ordinal}
                            selected={selectedIds.has(lead.id)}
                            onToggleSelect={toggleSelect}
                            unreadCount={unreadByLead?.get(lead.id) ?? 0}
                          />
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <BroadcastBar
        leads={leads}
        selectedIds={selectedIds}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
