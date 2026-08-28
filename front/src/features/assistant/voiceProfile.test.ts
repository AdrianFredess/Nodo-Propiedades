import { describe, expect, it } from 'vitest';
import { VOICE_SYSTEM_PROMPT, styleSamplesForPrompt } from './voiceProfile';

describe('voiceProfile', () => {
  it('tiene muestras de estilo', () => {
    expect(styleSamplesForPrompt().length).toBeGreaterThan(3);
  });

  it('define prompt de voz argentino', () => {
    expect(VOICE_SYSTEM_PROMPT).toContain('Asistente');
    expect(VOICE_SYSTEM_PROMPT).toMatch(/argentino rioplatense/i);
    expect(VOICE_SYSTEM_PROMPT).toMatch(/PROHIBIDO.*che/i);
  });
});
