import { config } from '../../shared/api/client';
import { prepareTextForTts } from './sanitizeSpeech';

export type TtsMode = 'browser' | 'edge' | 'elevenlabs' | 'off';

let speaking = false;
let currentAudio: HTMLAudioElement | null = null;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

const SPAIN_BLOCK =
  /\b(es-es|spain|españa|espana|helena|sabina|elvira|laura|lucia|monica|paulina)\b/i;

const ENGLISH_BLOCK = /\b(en-|english|united states|uk english|google us)\b/i;

const ARGENTINA_BOOST =
  /\b(es-ar|argentin|argentina|pablo|diego|tomas|latinoam|rioplat|buenos)\b/i;

export function scoreArgentineVoice(voice: {
  lang: string;
  name: string;
  voiceURI?: string;
}): number {
  const lang = voice.lang.toLowerCase();
  const blob = `${voice.name} ${voice.voiceURI ?? ''}`.toLowerCase();

  if (SPAIN_BLOCK.test(lang) || SPAIN_BLOCK.test(blob)) return -1000;
  if (ENGLISH_BLOCK.test(lang) || ENGLISH_BLOCK.test(blob)) return -1000;
  if (lang.startsWith('ca-')) return -500;

  let score = 0;
  if (lang === 'es-ar' || lang.startsWith('es-ar')) score += 200;
  if (ARGENTINA_BOOST.test(blob)) score += 80;
  if (/\b(male|masculino|hombre|pablo|diego)\b/i.test(blob)) score += 30;
  if (lang.startsWith('es-mx') || lang.startsWith('es-co')) score += 15;
  if (lang.startsWith('es-') && !lang.startsWith('es-es')) score += 5;

  const hint = config.ttsVoiceHint.trim().toLowerCase();
  if (hint && blob.includes(hint)) score += 500;

  return score;
}

function listVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }

  const existing = listVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      const finish = () => resolve(listVoices());
      window.speechSynthesis.addEventListener('voiceschanged', finish, {
        once: true,
      });
      window.setTimeout(finish, 800);
    });
  }

  return voicesReady;
}

export function pickArgentineVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const spanishOnly = voices.filter((v) => {
    const lang = v.lang.toLowerCase();
    return lang.startsWith('es-') && !lang.startsWith('es-es');
  });

  const ranked = spanishOnly
    .map((v) => ({ v, score: scoreArgentineVoice(v) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.v ?? null;
}

export function describeSelectedVoice(
  voice: SpeechSynthesisVoice | null,
): string {
  if (!voice) return 'Voz del sistema (genérica)';
  return `${voice.name} (${voice.lang})`;
}

async function speakBrowser(text: string): Promise<void> {
  if (!('speechSynthesis' in window)) {
    throw new Error('Tu navegador no soporta síntesis de voz.');
  }

  const voices = await ensureVoicesLoaded();
  const voice = pickArgentineVoice(voices);
  if (!voice) {
    throw new Error(
      'No hay voz argentina en el navegador. Usá VITE_TTS_MODE=edge (recomendado) o instalá Pablo (es-AR).',
    );
  }

  return new Promise((resolve, reject) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-AR';
    utter.voice = voice;
    utter.rate = 0.98;
    utter.pitch = 0.92;
    utter.onend = () => resolve();
    utter.onerror = () => reject(new Error('tts_error'));
    window.speechSynthesis.speak(utter);
  });
}

async function playAudioBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  currentAudio = new Audio(url);
  await new Promise<void>((resolve, reject) => {
    if (!currentAudio) return reject(new Error('audio_init'));
    currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    currentAudio.onerror = () => reject(new Error('audio_play'));
    void currentAudio.play();
  });
}

async function speakEdge(text: string): Promise<void> {
  const url = config.ttsUrl.trim();
  if (!url) {
    throw new Error(
      'Configurá VITE_TTS_URL (ej. http://127.0.0.1:3099/tts) para voz argentina.',
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/webm' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`TTS argentino ${res.status}: ${detail.slice(0, 120)}`);
  }

  const blob = await res.blob();
  await playAudioBlob(blob);
}

async function speakElevenLabs(text: string): Promise<void> {
  const apiKey = config.elevenLabsApiKey;
  const voiceId = config.elevenLabsVoiceId;
  if (!apiKey || !voiceId) {
    throw new Error(
      'Configurá VITE_ELEVENLABS_API_KEY y VITE_ELEVENLABS_VOICE_ID para tu voz argentina clonada.',
    );
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        language_code: 'es',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.88,
          style: 0.28,
        },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 120)}`);
  }

  const blob = await res.blob();
  await playAudioBlob(blob);
}

export async function speakText(text: string, mode: TtsMode): Promise<void> {
  const prepared = prepareTextForTts(text);
  if (mode === 'off' || !prepared.trim()) return;
  speaking = true;
  try {
    if (mode === 'elevenlabs') {
      await speakElevenLabs(prepared);
    } else if (mode === 'edge') {
      await speakEdge(prepared);
    } else {
      await speakBrowser(prepared);
    }
  } finally {
    speaking = false;
    currentAudio = null;
  }
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  speaking = false;
}

export function isSpeaking(): boolean {
  return speaking;
}

export function resolveTtsMode(): TtsMode {
  const raw = config.ttsMode;
  if (
    raw === 'off' ||
    raw === 'browser' ||
    raw === 'edge' ||
    raw === 'elevenlabs'
  ) {
    return raw;
  }
  if (config.elevenLabsApiKey && config.elevenLabsVoiceId) {
    return 'elevenlabs';
  }
  return 'edge';
}

export async function getTtsVoiceLabel(mode: TtsMode): Promise<string> {
  if (mode === 'off') return 'Sin voz';
  if (mode === 'elevenlabs') return 'Voz clonada (tu tono)';
  if (mode === 'edge') return 'Tomás — argentino (Edge TTS)';
  const voices = await ensureVoicesLoaded();
  const picked = pickArgentineVoice(voices);
  if (picked) return describeSelectedVoice(picked);
  return 'Sin voz AR — usá modo edge (VITE_TTS_MODE=edge)';
}
