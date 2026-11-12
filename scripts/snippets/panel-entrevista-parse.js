/* __ENTREVISTA_VALIDATOR__ */
function textoVisibleGroq(message) {
  const msg = message || {};
  let text = msg.content == null ? '' : String(msg.content);
  const thinkClose = new RegExp(String.raw`[\s\S]*?` + '\x3c/' + 'think\x3e', 'gi');
  text = text.replace(thinkClose, '');
  text = text.replace(/<\|[^|]*\|>/g, '');
  return text.trim();
}

const groq = $input.first().json;
const msg = groq.choices?.[0]?.message || {};
let raw = textoVisibleGroq(msg);

let parsed = null;
try {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) parsed = JSON.parse(m[0]);
} catch (e) {
  parsed = null;
}

const val = typeof validateEntrevistaDraft === 'function' ? validateEntrevistaDraft(parsed) : { ok: false, errors: ['validator_missing'] };

if (!val.ok) {
  return [
    {
      json: {
        ok: false,
        errors: val.errors || ['json_invalido'],
        draft: null,
      },
    },
  ];
}

return [{ json: { ok: true, draft: val.draft, errors: [] } }];
