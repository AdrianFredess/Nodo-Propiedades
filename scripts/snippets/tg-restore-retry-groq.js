/**
 * Tras Wait de retry 429: rearmar body para HTTP Groq con el prompt original.
 */
let prompt = {};
try {
  prompt = $('Construir Prompt').first().json || {};
} catch (e) {
  prompt = {};
}
const prev = $input.first().json || {};
return [
  {
    json: {
      ...prompt,
      es_retry_groq: true,
      wait_retry_sec: Number(prev.wait_retry_sec) || 0,
      chat_id: String(prompt.chat_id || prev.chat_id || ''),
      messages: prompt.messages || prev.messages || [],
    },
  },
];
