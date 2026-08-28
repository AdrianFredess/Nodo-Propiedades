import { config } from '../../shared/api/client';
import type { AssistantIntent } from './assistantTypes';
import { polishSpeechLocal, sanitizeSpeech } from './sanitizeSpeech';
import {
  styleSamplesForPrompt,
  VOICE_SYSTEM_PROMPT,
  voiceStyleProfile,
} from './voiceProfile';

export interface HumanizeInput {
  userCommand: string;
  draftSpeech: string;
  intent: AssistantIntent['kind'];
  liveContext?: string;
}

function panelHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (config.panelApiToken) {
    headers['X-Panel-Token'] = config.panelApiToken;
  }
  return headers;
}

export async function humanizeAssistantSpeech(
  input: HumanizeInput,
): Promise<string> {
  const fallback = polishSpeechLocal(input.draftSpeech);

  if (!config.assistantHumanize || !config.assistantApiUrl) {
    return fallback;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(config.assistantApiUrl, {
      method: 'POST',
      headers: panelHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        userCommand: input.userCommand,
        draftSpeech: input.draftSpeech,
        intent: input.intent,
        liveContext: input.liveContext ?? '',
        traits: voiceStyleProfile.traits,
        styleSamples: styleSamplesForPrompt(4),
        systemPrompt: VOICE_SYSTEM_PROMPT,
      }),
    });

    if (!res.ok) {
      throw new Error(`assistant_http_${res.status}`);
    }

    const data = (await res.json()) as { speech?: string; error?: string };
    const speech = sanitizeSpeech(String(data.speech ?? '').trim());
    if (!speech) throw new Error(data.error || 'empty_speech');
    return speech;
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timeout);
  }
}
