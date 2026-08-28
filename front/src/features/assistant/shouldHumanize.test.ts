import { describe, expect, it } from 'vitest';
import { shouldHumanizeIntent } from './shouldHumanize';

describe('shouldHumanizeIntent', () => {
  it('omite Groq en comandos rápidos', () => {
    expect(shouldHumanizeIntent('navigate')).toBe(false);
    expect(shouldHumanizeIntent('open_lead')).toBe(false);
    expect(shouldHumanizeIntent('recent_activity')).toBe(false);
    expect(shouldHumanizeIntent('catch_up')).toBe(false);
  });

  it('humaniza resúmenes y contactos', () => {
    expect(shouldHumanizeIntent('summary_yesterday')).toBe(true);
    expect(shouldHumanizeIntent('who_to_contact')).toBe(true);
  });
});
