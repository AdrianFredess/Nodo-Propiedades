/**
 * SIMPLE-02 — Transcribe audio/voz WhatsApp con Groq Whisper.
 * Tokens se sustituyen en --deploy (__SET_*__).
 */
const META_TOKEN = '__SET_META_ACCESS_TOKEN__';
const GRAPH = '__SET_META_GRAPH_VERSION__';
const GROQ_KEY = '__SET_GROQ_API_KEY__';

const item = $input.first().json;
const mediaId = String(item.audio_media_id || '').trim();

if (!mediaId || String(item.mensaje || '').trim()) {
  return [{ json: { ...item, es_audio_sin_transcripcion: false } }];
}

function buildMultipart(buffer, filename, mime) {
  const boundary = '----NodoAudio' + Date.now();
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
  const body = Buffer.concat([
    Buffer.from(fields, 'utf8'),
    Buffer.from(headFile, 'utf8'),
    Buffer.from(buffer),
    Buffer.from(end, 'utf8'),
  ]);
  return { body, boundary };
}

async function transcribir() {
  if (!META_TOKEN || META_TOKEN.includes('SET_META') || !GROQ_KEY || GROQ_KEY.includes('SET_GROQ')) {
    return {
      ...item,
      mensaje: '',
      es_audio_sin_transcripcion: true,
      audio_error: 'faltan_credenciales',
    };
  }

  const meta = await this.helpers.httpRequest({
    method: 'GET',
    url: 'https://graph.facebook.com/' + GRAPH + '/' + encodeURIComponent(mediaId),
    headers: { Authorization: 'Bearer ' + META_TOKEN },
    json: true,
  });
  const fileUrl = String((meta && meta.url) || '').trim();
  if (!fileUrl) {
    return { ...item, mensaje: '', es_audio_sin_transcripcion: true, audio_error: 'sin_url' };
  }

  const bin = await this.helpers.httpRequest({
    method: 'GET',
    url: fileUrl,
    headers: { Authorization: 'Bearer ' + META_TOKEN },
    encoding: 'arraybuffer',
    returnFullResponse: false,
  });
  const buffer = Buffer.isBuffer(bin) ? bin : Buffer.from(bin);
  if (!buffer.length) {
    return { ...item, mensaje: '', es_audio_sin_transcripcion: true, audio_error: 'audio_vacio' };
  }

  const mime = String(item.audio_mime || (meta && meta.mime_type) || 'audio/ogg');
  const ext = /mpeg|mp3/i.test(mime) ? 'mp3' : /mp4|m4a/i.test(mime) ? 'm4a' : 'ogg';
  const { body, boundary } = buildMultipart(buffer, 'nota-voz.' + ext, mime);
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
  const texto = String((whisper && (whisper.text || whisper.transcript)) || '').trim();
  if (!texto) {
    return { ...item, mensaje: '', es_audio_sin_transcripcion: true, audio_error: 'sin_texto' };
  }
  return {
    ...item,
    mensaje: texto,
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
        ...item,
        mensaje: '',
        es_audio_sin_transcripcion: true,
        audio_error: String((e && e.message) || e || 'transcribe_fail').slice(0, 180),
      },
    },
  ];
}
