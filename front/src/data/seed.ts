import type { Lead, LeadsPayload, Propiedad } from '../shared/types/lead';

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86400_000).toISOString();
}

const SEED_LEADS: Lead[] = [
  {
    id: 'telegram:900099',
    chatId: '900099',
    nombre: 'Diego Conversando',
    zona: 'Godoy Cruz',
    presupuesto: '',
    canalOrigen: 'telegram',
    temperatura: 'tibio',
    leadCompleto: false,
    estadoSeguimiento: 'ninguno',
    status: 'abierto',
    tipoOperacion: '',
    ultimaActualizacion: hoursAgo(1),
    lastMessage: 'Hola, busco depto en Godoy Cruz',
    propiedadId: 'P-101',
    propiedadReferencia: 'Depto Godoy Cruz 2 amb',
    historial: [
      {
        id: 'cv1',
        fecha: hoursAgo(1),
        mensajeCliente: 'Hola, busco depto en Godoy Cruz',
        respuestaBot: 'Hola Diego. Tengo opciones en Godoy Cruz. ¿Presupuesto aproximado?',
        temperatura: 'tibio',
      },
    ],
  },
  {
    id: 'telegram:900001',
    chatId: '900001',
    nombre: 'Carla Méndez',
    zona: 'Godoy Cruz',
    presupuesto: '95.000 USD',
    canalOrigen: 'telegram',
    temperatura: 'caliente',
    leadCompleto: true,
    estadoSeguimiento: 'respondido',
    status: 'abierto',
    tipoOperacion: 'compra',
    ultimaActualizacion: hoursAgo(2),
    lastMessage: 'Quiero agendar visita esta semana',
    propiedadId: 'P-101',
    propiedadReferencia: 'Depto Godoy Cruz 2 amb',
    historial: [
      {
        id: 'c1',
        fecha: hoursAgo(28),
        mensajeCliente: 'Hola, busco depto en Godoy Cruz',
        respuestaBot:
          '¡Hola Carla! Tenemos opciones en Godoy Cruz. ¿Cuál es tu presupuesto aproximado?',
        temperatura: 'tibio',
      },
      {
        id: 'c2',
        fecha: hoursAgo(2),
        mensajeCliente: 'Quiero agendar visita esta semana',
        respuestaBot:
          'Excelente. Un asesor te contactará hoy para coordinar horarios.',
        temperatura: 'caliente',
      },
    ],
  },
  {
    id: 'telegram:900002',
    chatId: '900002',
    nombre: 'Martín Ríos',
    zona: 'Maipú',
    presupuesto: '180.000 USD',
    canalOrigen: 'telegram',
    temperatura: 'caliente',
    leadCompleto: true,
    estadoSeguimiento: 'respondido',
    status: 'abierto',
    tipoOperacion: 'compra',
    ultimaActualizacion: hoursAgo(5),
    lastMessage: 'Casa con patio, financiamiento ok',
    propiedadId: 'P-102',
    propiedadReferencia: 'Casa Maipú 3 amb',
    historial: [
      {
        id: 'm1',
        fecha: hoursAgo(5),
        mensajeCliente: 'Casa con patio, financiamiento ok',
        respuestaBot: 'Te mando 2 fichas. ¿Preferís lunes o martes para verlas?',
        temperatura: 'caliente',
      },
    ],
  },
  {
    id: 'whatsapp:5492611111111',
    chatId: '5492611111111',
    nombre: 'Sofía Blanco',
    zona: 'Ciudad',
    presupuesto: '400 USD',
    canalOrigen: 'whatsapp',
    temperatura: 'tibio',
    leadCompleto: true,
    estadoSeguimiento: 'ninguno',
    status: 'abierto',
    tipoOperacion: 'alquiler',
    ultimaActualizacion: hoursAgo(8),
    lastMessage: 'Busco monoambiente en Ciudad',
    propiedadId: 'P-103',
    propiedadReferencia: 'Depto Ciudad 1 amb alquiler',
    historial: [],
  },
  {
    id: 'telegram:900010',
    chatId: '900010',
    nombre: 'Solo miraba',
    zona: '',
    presupuesto: '',
    canalOrigen: 'telegram',
    temperatura: 'frio',
    leadCompleto: true,
    estadoSeguimiento: 'enviado_2',
    status: 'cerrado_sin_respuesta',
    tipoOperacion: '',
    ultimaActualizacion: daysAgo(10),
    lastMessage: 'ok',
    historial: [
      {
        id: 'sm1',
        fecha: daysAgo(12),
        mensajeCliente: 'ok',
        respuestaBot: 'Quedo a disposición cuando necesites.',
        temperatura: 'frio',
      },
    ],
  },
];

const SEED_PROPIEDADES: Propiedad[] = [
  {
    id: 'P-101',
    zona: 'Godoy Cruz',
    tipo: 'Departamento',
    precio: '95.000 USD',
    ambientes: '2',
    operacion: 'venta',
    estado: 'disponible',
    honorarios: '4% + IVA',
    reserva: 'Seña 2.000 USD',
    mediosPago: 'Transferencia / efectivo',
    aliasCbu: 'EDITAR_EN_SHEETS',
    requisitos: 'DNI + reserva',
    interesadosCount: 2,
    interesados: [],
  },
  {
    id: 'P-102',
    zona: 'Maipú',
    tipo: 'Casa',
    precio: '165.000 USD',
    ambientes: '3',
    operacion: 'venta',
    estado: 'disponible',
    interesadosCount: 1,
    interesados: [],
  },
  {
    id: 'P-103',
    zona: 'Ciudad',
    tipo: 'Departamento',
    precio: '450 USD',
    ambientes: '1',
    operacion: 'alquiler',
    estado: 'disponible',
    interesadosCount: 1,
    interesados: [],
  },
  {
    id: 'P-104',
    zona: 'Chacras de Coria',
    tipo: 'Casa',
    precio: '220.000 USD',
    ambientes: '4',
    operacion: 'venta',
    estado: 'disponible',
    interesadosCount: 0,
    interesados: [],
  },
  {
    id: 'P-105',
    zona: 'Luján de Cuyo',
    tipo: 'Lote',
    precio: '55.000 USD',
    ambientes: '',
    operacion: 'venta',
    estado: 'disponible',
    interesadosCount: 0,
    interesados: [],
  },
];

function attachInteresados(leads: Lead[], props: Propiedad[]): Propiedad[] {
  return props.map((prop) => {
    const interesados = leads
      .filter(
        (l) =>
          l.propiedadId === prop.id ||
          (l.propiedadReferencia || '')
            .toLowerCase()
            .includes(prop.id.toLowerCase()),
      )
      .map((l) => ({
        id: l.id,
        chatId: l.chatId,
        nombre: l.nombre,
        temperatura: l.temperatura,
        canalOrigen: l.canalOrigen,
        leadCompleto: l.leadCompleto,
        zona: l.zona,
        presupuesto: l.presupuesto,
        ultimaActualizacion: l.ultimaActualizacion,
      }));
    return { ...prop, interesados, interesadosCount: interesados.length };
  });
}

export function getMockPayload(): LeadsPayload {
  return {
    generatedAt: new Date().toISOString(),
    leads: SEED_LEADS,
    propiedades: attachInteresados(SEED_LEADS, SEED_PROPIEDADES),
    source: 'mock',
  };
}
