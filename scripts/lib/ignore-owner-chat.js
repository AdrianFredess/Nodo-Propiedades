'use strict';

/**
 * Ignorar mensajes del chat del dueño (OWNER_TELEGRAM_CHAT_ID).
 * Grupos Telegram suelen ser negativos; comparar como string.
 */

/**
 * @param {string|number|null|undefined} chatId
 * @param {string|number|null|undefined} ownerChatId
 * @returns {boolean}
 */
function isOwnerChat(chatId, ownerChatId) {
  const a = String(chatId ?? '').trim();
  const b = String(ownerChatId ?? '').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  // normalizar -100… vs variantes numéricas
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na === nb) return true;
  return false;
}

/**
 * @param {{ chat_id?: string|number, [k: string]: unknown }} item
 * @param {string|number|null|undefined} ownerChatId
 * @returns {{ skip: boolean, reason?: string }}
 */
function shouldIgnoreOwnerMessage(item, ownerChatId) {
  const chatId = item?.chat_id ?? item?.chatId ?? null;
  if (isOwnerChat(chatId, ownerChatId)) {
    return { skip: true, reason: 'owner_chat' };
  }
  return { skip: false };
}

module.exports = { isOwnerChat, shouldIgnoreOwnerMessage };
