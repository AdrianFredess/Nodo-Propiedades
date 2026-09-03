/**
 * Bot Telegram — Transcribe voice/audio con Groq Whisper.
 * Tokens se sustituyen en --deploy (__SET_*__).
 */
const TG_TOKEN = '__SET_TELEGRAM_BOT_TOKEN__';
const GROQ_KEY = '__SET_GROQ_API_KEY__';

const prev = $input.first().json;
const trigger = $('Telegram Trigger').first().json;
const msg = (trigger && trigger.message) || trigger || {};
const voice = msg.voice || msg.audio || null;
const fileId = String(
  prev.voice_file_id || (voice && voice.file_id) || '',
).trim();
const textoYa = String(prev.texto_usuario || msg.text || msg.caption || '').trim();

if (!fileId || textoYa) {
  return [
    {
      json: {
        ...prev,
        texto_usuario: textoYa || String(prev.texto_usuario || ''),
        es_audio_sin_transcripcion: false,
      },
    },
  ];
}

function buildMultipart(buffer, filename, mime) {
  const boundary = '----NodoAudioTg' + Date.now();
  const headFile =
    '--' +
    boundary +
    '\r\nContent-Disposition: form-data; name="file"; filename="' +
    filename +
    '"\r\nContent-Type: ' +
    mime +
    '\r\n\r\n';
  const fields =
    '--' +
    boundary +
    '\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n' +
    '--' +
    boundary +
    '\r\nContent-Disposition: form-data; name="language"\r\n\r\nes\r\n';
  const end = '\r\n--' + boundary + '--\r\n';
  return {
    boundary,
    body: Buffer.concat([
      Buffer.from(fields, 'utf8'),
      Buffer.from(headFile, 'utf8'),
      Buffer.from(buffer),
      Buffer.from(end, 'utf8'),
    ]),
  };
}

async function transcribir() {
  if (!TG_TOKEN || TG_TOKEN.includes('SET_TELEGRAM') || !GROQ_KEY || GROQ_KEY.includes('SET_GROQ')) {
    return {
      ...prev,
      texto_usuario: '',
      es_audio_sin_transcripcion: true,
      audio_error: 'faltan_credenciales',
    };
  }

  const info = await this.helpers.httpRequest({
    method: 'GET',
    url:
      'https://api.telegram.org/bot' +
      TG_TOKEN +
      '/getFile?file_id=' +
      encodeURIComponent(fileId),
    json: true,
  });
  const filePath = String((info && info.result && info.result.file_path) || '').trim();
  if (!filePath) {
    return { ...prev, texto_usuario: '', es_audio_sin_transcripcion: true, audio_error: 'sin_file' };
  }

  const bin = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.telegram.org/file/bot' + TG_TOKEN + '/' + filePath,
    encoding: 'arraybuffer',
  });
  const buffer = Buffer.isBuffer(bin) ? bin : Buffer.from(bin);
  if (!buffer.length) {
    return { ...prev, texto_usuario: '', es_audio_sin_transcripcion: true, audio_error: 'audio_vacio' };
  }

  const mime = String((voice && voice.mime_type) || 'audio/ogg');
  const { body, boundary } = buildMultipart(buffer, 'voz.ogg', mime);
  const whisper = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    headers: {
      Authorization: 'Bearer ' + GROQ_KEY,
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
    },
    body,
    json: true,
  });
  const texto = String((whisper && whisper.text) || '').trim();
  if (!texto) {
    return { ...prev, texto_usuario: '', es_audio_sin_transcripcion: true, audio_error: 'sin_texto' };
  }
  return {
    ...prev,
    texto_usuario: texto,
    es_audio: true,
    es_audio_transcrito: true,
    es_audio_sin_transcripcion: false,
    audio_transcripto: texto,
  };
}

try {
  const out = await transcribir.call(this);
  return [{ json: out }];
} catch (e) {
  return [
    {
      json: {
        ...prev,
        texto_usuario: '',
        es_audio_sin_transcripcion: true,
        audio_error: String((e && e.message) || e || 'transcribe_fail').slice(0, 180),
      },
    },
  ];
}
