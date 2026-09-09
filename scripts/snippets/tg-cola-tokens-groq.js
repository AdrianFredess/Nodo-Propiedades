/**
 * Cola justa de TPM Groq (antes de HTTP Groq).
 * 5 chats a la vez → cada uno toma un slot (~1 llamada / ventana),
 * esperando en silencio hasta 5 min. Configurable vía staticData.
 *
 * Free ~8k TPM → ~1 llamada grande/min. Developer: subir tpmBudget.
 */
const j = $input.first().json || {};
const chatId = String(j.chat_id || '').trim();

const DEFAULT_TPM = 7500; // headroom bajo 8k free
const DEFAULT_EST = 5200; // pedidos reales ~5k
const MAX_WAIT_MS = 5 * 60 * 1000;
const MIN_SLOT_MS = 20 * 1000;

const sd = $getWorkflowStaticData('global');
if (!sd.groqTokenCtrl) {
  sd.groqTokenCtrl = {
    nextSlotAt: 0,
    tpmBudget: DEFAULT_TPM,
    estTokens: DEFAULT_EST,
    maxWaitMs: MAX_WAIT_MS,
    byChat: {},
  };
}
const ctrl = sd.groqTokenCtrl;
if (!ctrl.byChat) ctrl.byChat = {};

const tpm = Math.max(2000, Number(ctrl.tpmBudget) || DEFAULT_TPM);
const est = Math.max(1500, Number(ctrl.estTokens) || DEFAULT_EST);
const maxWait = Math.max(60000, Number(ctrl.maxWaitMs) || MAX_WAIT_MS);
const slotMs = Math.max(MIN_SLOT_MS, Math.ceil((60000 * est) / tpm));

const now = Date.now();
// Si un 429 reciente empujó nextSlotAt, respetarlo
let slotAt = Math.max(Number(ctrl.nextSlotAt) || 0, now);
let waitMs = Math.max(0, slotAt - now);

if (waitMs > maxWait) {
  // Cola saturada: avisar dueño (flag) pero igual capar a maxWait
  waitMs = maxWait;
  slotAt = now + maxWait;
  ctrl.cola_saturada = true;
} else {
  ctrl.cola_saturada = false;
}

ctrl.nextSlotAt = slotAt + slotMs;
ctrl.byChat[chatId] = {
  reservedAt: now,
  slotAt,
  waitMs,
  slotMs,
};

return [
  {
    json: {
      ...j,
      wait_cola_sec: Math.ceil(waitMs / 1000),
      wait_cola_ms: waitMs,
      groq_slot_ms: slotMs,
      groq_tpm_budget: tpm,
      groq_est_tokens: est,
      groq_cola_saturada: Boolean(ctrl.cola_saturada),
    },
  },
];
