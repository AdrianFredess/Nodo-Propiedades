export type Temperatura = 'frio' | 'tibio' | 'caliente';

export type PipelineColumna = 'conversando' | Temperatura;

export type CanalOrigen = 'telegram' | 'whatsapp' | 'messenger';

export type EstadoSeguimiento =
  | 'ninguno'
  | 'enviado_1'
  | 'enviado_2'
  | 'respondido'
  | 'cerrado';

export interface HistorialMensaje {
  id: string;
  fecha: string;
  mensajeCliente: string;
  respuestaBot: string;
  temperatura?: Temperatura;
  canal?: string;
  /** Mensaje local aún no confirmado por Sheets/PANEL-01 */
  pending?: boolean;
}

export interface LeadInteresadoResumen {
  id: string;
  chatId: string;
  nombre: string;
  temperatura: Temperatura;
  canalOrigen: CanalOrigen;
  leadCompleto: boolean;
  zona: string;
  presupuesto: string;
  ultimaActualizacion: string;
}

export interface Lead {
  id: string;
  chatId: string;
  nombre: string;
  zona: string;
  presupuesto: string;
  canalOrigen: CanalOrigen;
  temperatura: Temperatura;
  /** false = aún en conversación; true = clasificado (sale de Conversando) */
  leadCompleto: boolean;
  estadoSeguimiento: EstadoSeguimiento;
  status: string;
  tipoOperacion: string;
  ultimaActualizacion: string;
  lastMessage: string;
  historial: HistorialMensaje[];
  /** ID de stock vinculado (propiedad_seguimiento) */
  propiedadId?: string;
  propiedadReferencia?: string;
  /** IA pausada — el asesor humano debe continuar */
  botPaused?: boolean;
  handoff?: boolean;
}

export interface Propiedad {
  id: string;
  zona: string;
  tipo: string;
  precio: string;
  ambientes: string;
  operacion: string;
  estado?: string;
  descripcion?: string;
  /** Condiciones / medios de pago (Sheets) */
  honorarios?: string;
  reserva?: string;
  mediosPago?: string;
  aliasCbu?: string;
  requisitos?: string;
  fotos?: string[];
  linkFicha?: string;
  interesadosCount?: number;
  interesados?: LeadInteresadoResumen[];
  /** Campos enriquecidos desde propiedadMedia / CSV */
  titulo?: string;
  caption?: string;
  precioUsd?: number;
  direccion?: string;
  metrosCuadrados?: string;
  dormitorios?: string;
  banos?: string;
  expensas?: string;
  /** Chips / amenities derivados o desde media */
  highlights?: string[];
}

export interface LeadsPayload {
  generatedAt: string;
  leads: Lead[];
  propiedades?: Propiedad[];
  source: 'live' | 'mock';
  /** Aviso del backend (ej. cuota Sheets) — no inventar datos */
  warning?: string;
}

export interface EnvioMasivoRequest {
  chat_ids: string[];
  text: string;
}

export interface EnvioMasivoResult {
  chat_id: string;
  ok: boolean;
  description?: string;
}

export interface EnvioMasivoResponse {
  ok: boolean;
  sent?: number;
  failed?: number;
  error?: string;
  results?: EnvioMasivoResult[];
}
