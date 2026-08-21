export const TURMAS = ['Todas as Turmas', 'Nido', 'Kids I', 'Kids II - Flores', 'Kids II - Frutos'];

export const CARGOS_FUNCIONARIOS = [
  'Administradora',
  'Auxiliar de Sala',
  'Auxiliar de Serviços Gerais',
  'Coordenadora',
  'Cozinheira',
  'Diretora',
  'Estagiária',
  'Porteiro',
  'Professora',
  'Recepcionista',
];

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

// Registros Pedagógicos Internos: tipos de registro (usam a mesma tabela
// pedagogical_records, com content jsonb variando por tipo). Começa só com
// Observação Diária — Períodos Sensíveis e Interações Sociais entram em fases
// futuras do módulo, reaproveitando a mesma tabela/CHECK constraint.
export const PEDAGOGICAL_RECORD_TYPES = [
  { value: 'DAILY_OBSERVATION', label: 'Observação Diária' },
];

// Níveis usados no formulário de Observação Diária (campos qualitativos, não notas).
export const NIVEL_CONCENTRACAO = [
  { value: 'baixo', label: 'Baixo' },
  { value: 'medio', label: 'Médio' },
  { value: 'alto', label: 'Alto' },
];

export const NIVEL_AUTONOMIA = [
  { value: 'com_apoio', label: 'Com apoio constante' },
  { value: 'parcial', label: 'Parcialmente autônomo' },
  { value: 'autonomo', label: 'Autônomo' },
];
