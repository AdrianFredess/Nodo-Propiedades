const root = $input.first().json;
const body = root.body && typeof root.body === 'object' ? root.body : root;
const respuestas = Array.isArray(body.respuestas) ? body.respuestas : [];

const bloque = respuestas
  .map((r, i) => {
    const pregunta = String(r.pregunta || r.id || 'Pregunta ' + (i + 1)).trim();
    const resp = r.saltada
      ? '(saltada por el dueño)'
      : String(r.respuesta || '').trim() || '(sin respuesta)';
    return pregunta + '\n' + resp;
  })
  .join('\n\n');

const system =
  'Sos redactor de configuración para un asesor inmobiliario (Matías) en Mendoza, Argentina.\n' +
  'A partir de las respuestas del dueño, devolvé SOLO un objeto JSON válido (sin markdown, sin texto extra).\n' +
  'Reglas:\n' +
  '- Español rioplatense.\n' +
  '- NO inventes políticas, descuentos ni promesas que el dueño no dijo.\n' +
  '- Precios, stock y disponibilidad siempre vienen del catálogo, nunca de estas guías.\n' +
  '- Máximo 15 guías, cada una hasta 300 caracteres.\n' +
  '- ejemplo_estilo: respuesta a la pregunta 4 (estilo de mensaje), máximo 400 caracteres.\n' +
  '- operaciones: array subset de ["venta","alquiler","temporario"].\n' +
  '- tono: "profesional_cercano" | "formal" | "distendido".\n' +
  '- guias[].tipo: "estilo" | "preguntar_antes" | "derivar".\n' +
  'Esquema exacto:\n' +
  '{"inmobiliaria_nombre":"","asesor_nombre":"","tono":"profesional_cercano|formal|distendido",' +
  '"zonas":[""],"operaciones":["venta","alquiler","temporario"],' +
  '"guias":[{"tipo":"estilo|preguntar_antes|derivar","texto":""}],' +
  '"horario_humano_desde":"HH:MM","horario_humano_hasta":"HH:MM","ejemplo_estilo":""}';

const user =
  'ENTREVISTA (respuestas del dueño):\n\n' +
  bloque +
  '\n\nDevolvé el JSON del borrador de configuración.';

return [
  {
    json: {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  },
];
