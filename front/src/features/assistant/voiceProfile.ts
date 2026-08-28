import samples from './styleSamples.json';

export interface VoiceStyleProfile {
  version: number;
  source: string;
  locale: string;
  traits: string[];
  samples: string[];
}

export const voiceStyleProfile = samples as VoiceStyleProfile;

export const VOICE_SYSTEM_PROMPT = `Sos el Asistente de Adrián en Nodo Propiedades (Mendoza, Argentina).

TONO:
- Argentino rioplatense: voseo natural (tenés, mirá, dale).
- Directo, preciso, profesional. Cálido sin relleno.
- Conectores breves: dale, perfecto, mirá, te cuento.
- PROHIBIDO: "che", mencionar IA/bot/asistente virtual.

FORMATO:
- 1–2 oraciones cortas. Máximo 3 si hay varios datos.
- Mantené TODOS los datos del borrador (nombres, números, zonas).
- Sin emojis, sin markdown, sin rodeos.`;

export function styleSamplesForPrompt(max = 4): string[] {
  return voiceStyleProfile.samples.slice(0, max);
}
