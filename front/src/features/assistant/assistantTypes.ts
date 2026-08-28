import type { Lead } from '../../shared/types/lead';

export type AssistantAction =
  | { type: 'navigate'; path: string }
  | { type: 'open_lead'; leadId: string };

export interface AssistantReply {
  speech: string;
  actions: AssistantAction[];
  leads?: Lead[];
}

export type AssistantIntent =
  | { kind: 'navigate'; path: string }
  | { kind: 'open_lead'; leadId: string; leadName: string }
  | { kind: 'summary_yesterday' }
  | { kind: 'who_to_contact' }
  | { kind: 'summary_today' }
  | { kind: 'stats_overview' }
  | { kind: 'recent_activity' }
  | { kind: 'catch_up' }
  | { kind: 'help' }
  | { kind: 'unknown'; raw: string };
