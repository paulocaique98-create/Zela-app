export const TURMAS = ['Todas as Turmas', 'Nido', 'Kids I', 'Kids II - Flores', 'Kids II - Frutos'];

export const REFEICOES = ['Café da Manhã', 'Lanche da Manhã', 'Almoço', 'Lanche da Tarde'];

// Chat interno: setores que a família pode escolher para conversar.
// 'suporte_zela' é especial — não é respondido pela escola, vai para o
// painel do desenvolvedor/suporte da plataforma.
export const SETORES_CHAT = [
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'diretoria_pedagogica', label: 'Diretoria Pedagógica' },
  { value: 'coordenacao', label: 'Coordenação' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'suporte_zela', label: 'Suporte Zela' },
];

// Calendário escolar: tipos de evento (cor/rótulo)
export const EVENTO_TIPOS = [
  { value: 'geral', label: 'Geral', color: 'slate' },
  { value: 'feriado', label: 'Feriado', color: 'red' },
  { value: 'reuniao', label: 'Reunião', color: 'amber' },
  { value: 'evento', label: 'Evento', color: 'indigo' },
  { value: 'passeio', label: 'Passeio', color: 'green' },
];
