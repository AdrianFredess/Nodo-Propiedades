import propiedadMedia from '../../data/propiedadMedia.json';

type MediaEntry = {
  shareToken?: string;
  titulo?: string;
  tipo?: string;
  zona?: string;
  precio?: string;
  precioUsd?: number;
  operacion?: string;
  ambientes?: string;
  descripcion?: string;
  fotos?: string[];
  linkFicha?: string;
};

export function lookupPublicPropiedad(
  propiedadId: string,
  token: string,
): MediaEntry & { id: string } | null {
  const id = propiedadId.trim();
  const entry = propiedadMedia[id as keyof typeof propiedadMedia] as
    | MediaEntry
    | undefined;
  if (!entry?.shareToken) return null;
  if (entry.shareToken !== token.trim()) return null;
  return { ...entry, id };
}
