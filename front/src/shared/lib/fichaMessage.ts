import propiedadMedia from '../../data/propiedadMedia.json';

type MediaEntry = {
  titulo?: string;
  caption?: string;
  zona?: string;
  precio?: string;
  linkFicha?: string;
  fotos?: string[];
};

const MEDIA = propiedadMedia as Record<string, MediaEntry>;

/** Mismo form de cita que usa el bot TG (webhook n8n vía ngrok). */
export const CITA_FORM_BASE =
  'https://deranged-defile-comrade.ngrok-free.dev/webhook/cita-form';

export function buildAgendaLink(
  chatId: string,
  nombre = '',
  canal: 'telegram' | 'whatsapp' | string = 'telegram',
): string {
  const id = String(chatId || '').trim();
  if (!id) return CITA_FORM_BASE;
  return (
    CITA_FORM_BASE +
    '?chat_id=' +
    encodeURIComponent(id) +
    '&nombre=' +
    encodeURIComponent(String(nombre || '')) +
    '&canal=' +
    encodeURIComponent(String(canal || 'telegram'))
  );
}

/** Arma mensaje listo para Telegram/WA con fichas (texto + links públicos). */
export function buildFichasMessage(propIds: string[]): string {
  const ids = propIds
    .map((id) => String(id || '').trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 3);
  if (!ids.length) return 'Te dejo las opciones que veníamos mirando.';

  const blocks = ids.map((id) => {
    const m = MEDIA[id];
    if (!m) return `· ${id}`;
    const head = m.titulo || m.caption || id;
    const zona = m.zona ? ` (${m.zona})` : '';
    const precio = m.precio ? ` — ${m.precio}` : '';
    const link = m.linkFicha ? `\n${m.linkFicha}` : '';
    return `· ${head}${zona}${precio}${link}`;
  });

  return `Mira, te dejo estas:\n\n${blocks.join('\n\n')}\n\nCual te cierra mas?`;
}

export function buildAgendaMessage(
  link: string,
  opts?: { chatId?: string; nombre?: string; canal?: string },
): string {
  let url = String(link || '').trim();
  if (!url && opts?.chatId) {
    url = buildAgendaLink(opts.chatId, opts.nombre, opts.canal);
  }
  if (!url) {
    return 'Dale, coordinamos la visita. El asesor te confirma el dia por aca.';
  }
  return `Dale, coordinamos. Link para agendar:\n${url}\n\nCuando lo completes te confirma el asesor.`;
}

export function primaryPhotoUrl(propId: string): string | null {
  const m = MEDIA[String(propId || '').trim().toUpperCase()];
  const foto = m?.fotos?.[0];
  return foto ? String(foto) : null;
}
