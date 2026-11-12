export type EntrevistaPregunta = {
  id: string;
  texto: string;
  ayuda: string;
};

export const ENTREVISTA_PREGUNTAS: EntrevistaPregunta[] = [
  {
    id: 'q1',
    texto:
      '¿Cómo se llama la inmobiliaria y con qué nombre querés que se presente el asesor?',
    ayuda: 'Ej.: “Somos Mendoza Hogar, el asesor se presenta como Juan.”',
  },
  {
    id: 'q2',
    texto: '¿En qué zonas trabajan y qué tipo de propiedades tienen?',
    ayuda: 'Ej.: “Godoy Cruz y Maipú, deptos y casas.”',
  },
  {
    id: 'q3',
    texto: '¿Hacen venta, alquiler o las dos? ¿Alquiler temporario?',
    ayuda: 'Ej.: “Venta y alquiler anual, temporario solo en verano.”',
  },
  {
    id: 'q4',
    texto: '¿Cómo le hablás vos a un cliente? Pegá un mensaje real tuyo de ejemplo.',
    ayuda: 'Copiá un WhatsApp tuyo tal cual lo escribirías.',
  },
  {
    id: 'q5',
    texto: '¿Qué tiene que preguntar siempre antes de mandar propiedades?',
    ayuda: 'Ej.: “Zona y si es para vivir o inversión.”',
  },
  {
    id: 'q6',
    texto: '¿Qué no tiene que decir ni prometer nunca?',
    ayuda: 'Ej.: “No prometer escritura en 48 h ni descuentos.”',
  },
  {
    id: 'q7',
    texto: '¿Cuándo querés que te pase la conversación a vos o a tu equipo?',
    ayuda: 'Ej.: “Si pide visita o habla de seña.”',
  },
  {
    id: 'q8',
    texto: '¿En qué horario atienden y cómo coordinan las visitas?',
    ayuda: 'Ej.: “Lun–vie 9 a 19, visitas con 24 h de aviso.”',
  },
];

export const MAX_RESPUESTA_CHARS = 800;
