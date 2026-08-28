import { describe, expect, it } from 'vitest';
import { pickArgentineVoice, scoreArgentineVoice } from './tts';

describe('scoreArgentineVoice', () => {
  it('prioriza es-AR sobre es-ES', () => {
    const ar = scoreArgentineVoice({
      lang: 'es-AR',
      name: 'Microsoft Pablo Online (Natural) - Spanish (Argentina)',
    });
    const es = scoreArgentineVoice({
      lang: 'es-ES',
      name: 'Microsoft Helena Online (Natural) - Spanish (Spain)',
    });
    expect(ar).toBeGreaterThan(es);
    expect(es).toBeLessThan(0);
  });

  it('elige voz argentina del listado', () => {
    const voices = [
      { lang: 'es-ES', name: 'Helena', voiceURI: 'helena' },
      { lang: 'es-AR', name: 'Pablo', voiceURI: 'pablo' },
    ] as SpeechSynthesisVoice[];
    expect(pickArgentineVoice(voices)?.name).toBe('Pablo');
  });

  it('rechaza voces inglesas', () => {
    const en = scoreArgentineVoice({
      lang: 'en-US',
      name: 'Microsoft David - English (United States)',
    });
    expect(en).toBeLessThan(0);
    expect(
      pickArgentineVoice([
        { lang: 'en-US', name: 'David', voiceURI: 'david' },
        { lang: 'es-AR', name: 'Pablo', voiceURI: 'pablo' },
      ] as SpeechSynthesisVoice[])?.name,
    ).toBe('Pablo');
  });
});
