/** Limpia y afina texto para voz — tono profesional argentino. */
export function sanitizeSpeech(text: string): string {
  let s = String(text || '').trim();
  if (!s) return s;

  s = s.replace(/\p{Extended_Pictographic}/gu, '');
  s = s.replace(/\b[Cc]he\b[,.;:!?]*\s*/g, '');
  s = s.replace(
    /\b(soy (un |una )?(bot|ia|inteligencia artificial|asistente virtual|automatizado))\b/gi,
    '',
  );
  s = s.replace(/\b(como (un )?bot|respuesta automatizada)\b/gi, '');
  s = s.replace(/\s{2,}/g, ' ').trim();

  if (s && !/[.!?…]$/.test(s)) s += '.';
  return s;
}

/** Ajustes locales si Groq no está disponible. */
export function polishSpeechLocal(draft: string): string {
  let s = sanitizeSpeech(draft);
  const replacements: [RegExp, string][] = [
    [/\bListo,\s*abro\b/gi, 'Dale, te abro'],
    [/\bVamos al pipeline\b/gi, 'Perfecto, vamos al pipeline'],
    [/\bNo entendí\b/gi, 'No te capté'],
    [/\bPodés\b/g, 'Podés'],
    [/\bleads\b/gi, 'leads'],
  ];
  for (const [re, rep] of replacements) {
    s = s.replace(re, rep);
  }
  return sanitizeSpeech(s);
}

/** Prepara texto para TTS del navegador. */
export function prepareTextForTts(text: string): string {
  return sanitizeSpeech(text)
    .replace(/\bUSD\b/gi, 'dólares')
    .replace(/\b(\d+)\.(\d{3})\b/g, '$1 mil $2')
    .replace(/·/g, ', ');
}
