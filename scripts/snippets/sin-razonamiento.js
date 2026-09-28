/**
 * Lo que ve el cliente sale de content.
 * reasoning / reasoning_content es el pensamiento del modelo y no se manda.
 */
function textoVisibleGroq(message) {
  const msg = message || {};
  let text = msg.content == null ? '' : String(msg.content);
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<\|[^|]*\|>/g, '');
  return text.trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { textoVisibleGroq };
}
