import type { AssistantIntent } from './assistantTypes';

/** Intents con respuesta local ya lista — sin round-trip a Groq. */
const LOCAL_ONLY: ReadonlySet<AssistantIntent['kind']> = new Set([
  'navigate',
  'open_lead',
  'help',
  'recent_activity',
  'catch_up',
  'stats_overview',
  'unknown',
]);

export function shouldHumanizeIntent(kind: AssistantIntent['kind']): boolean {
  return !LOCAL_ONLY.has(kind);
}
