/**
 * Síntesis argentina vía Microsoft Edge Read Aloud (msedge-tts).
 * Voz neural es-AR — no depende de voces instaladas en el navegador.
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const DEFAULT_VOICE = process.env.TTS_VOICE || 'es-AR-TomasNeural';
const MAX_CHARS = Number(process.env.TTS_MAX_CHARS || 1200);

/** @type {MsEdgeTTS | null} */
let engine = null;
/** @type {string | null} */
let activeVoice = null;

async function getEngine(voice = DEFAULT_VOICE) {
  if (!engine || activeVoice !== voice) {
    engine = new MsEdgeTTS();
    await engine.setMetadata(voice, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
    activeVoice = voice;
  }
  return engine;
}

/**
 * @param {string} text
 * @param {{ voice?: string, rate?: number, pitch?: string }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function synthesizeArgentine(text, opts = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('texto_vacio');
  }
  if (trimmed.length > MAX_CHARS) {
    throw new Error(`texto_largo_max_${MAX_CHARS}`);
  }

  const voice = String(opts.voice || DEFAULT_VOICE).trim() || DEFAULT_VOICE;
  const tts = await getEngine(voice);
  const { audioStream } = tts.toStream(trimmed, {
    rate: opts.rate ?? 0.98,
    pitch: opts.pitch ?? '-2%',
  });

  const chunks = [];
  return new Promise((resolve, reject) => {
    audioStream.on('data', (chunk) => chunks.push(chunk));
    audioStream.on('close', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
}

export function ttsInfo() {
  return {
    voice: DEFAULT_VOICE,
    format: 'audio/webm',
    maxChars: MAX_CHARS,
  };
}
