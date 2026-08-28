import { describe, expect, it } from 'vitest';
import { polishSpeechLocal, prepareTextForTts, sanitizeSpeech } from './sanitizeSpeech';

describe('sanitizeSpeech', () => {
  it('quita che y emojis', () => {
    expect(sanitizeSpeech('Che, dale perfecto 👍')).toBe('dale perfecto.');
  });

  it('agrega punto final', () => {
    expect(sanitizeSpeech('Hola')).toBe('Hola.');
  });
});

describe('prepareTextForTts', () => {
  it('expande USD para voz', () => {
    expect(prepareTextForTts('Hasta 95.000 USD')).toContain('dólares');
  });
});

describe('polishSpeechLocal', () => {
  it('humaniza borrador básico', () => {
    expect(polishSpeechLocal('Listo, abro el catálogo')).toContain('te abro');
  });
});
