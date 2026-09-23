export const TURMAS = ['Todas as Turmas', 'Nido', 'Kids I', 'Kids II - Flores', 'Kids II - Frutos'];

// Valor de authorized_persons.relation que marca um autorizado como
// "transporte escolar" (van/motorista) -- essa categoria tem cota própria
// (limits.autorizados_transporte, padrão 1), separada da cota geral de
// autorizados (limits.autorizados_por_responsavel). O valor 'Transporte' já
// é usado pela RPC approve_matricula() (supabase/migrations/
// 20260904_approve_matricula_rpc.sql) ao converter uma solicitação de
// matrícula aprovada em authorized_persons -- mantido igual aqui pra
// reconhecer também quem entrou por aquele caminho, não só quem foi
// cadastrado direto em Autorizados.
export const AUTHORIZED_TRANSPORTE_RELATION = 'Transporte';

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

// Nomenclatura real usada pela nutricionista da escola (documento oficial de
// cardápio) — Desjejum, Almoço, Lanche, Jantar. Substituiu os nomes
// inventados anteriormente (Café da Manhã/Lanche da Manhã/Lanche da Tarde),
// que não batiam com o vocabulário real do cardápio.
export const REFEICOES = ['Desjejum', 'Almoço', 'Lanche', 'Jantar'];

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

// Motivos de correção manual de horário de check-in/check-out — obrigatório
// escolher um ao corrigir (ver AttendanceEditTodayModal.jsx). Aparece
// também pro responsável, no Histórico, como parte da transparência da
// correção.
export const ATTENDANCE_CORRECTION_REASONS = [
  { value: 'ERRO_TOTEM', label: 'Falha no totem/reconhecimento facial' },
  { value: 'ESQUECEU_REGISTRAR', label: 'Família ou aluno esqueceu de registrar' },
  { value: 'ENTRADA_OUTRA_VIA', label: 'Entrou ou saiu por outra via' },
  { value: 'ERRO_OPERACIONAL', label: 'Erro operacional da equipe' },
  { value: 'OUTRO', label: 'Outro motivo' },
];

// Id técnico da aba (adminTab/familyTab/teacherTab em App.jsx, activeTab em
// DeveloperLayout.jsx prefixado 'dev-') -> rótulo amigável. Usado tanto pelo
// título dinâmico do Header quanto pela tela de origem dos erros
// (DeveloperErrorLogs.jsx). Ids sem entrada aqui caem no fallback (id cru),
// nunca quebra por aba nova ainda não mapeada.
export const SCREEN_LABELS = {
  // Admin
  home: 'Início', register: 'Cadastro de Usuário', 'cadastro-funcionarios': 'Cadastro de Funcionário',
  users: 'Gestão de Usuários', students: 'Alunos', 'gerenciar-funcionarios': 'Gestão de Funcionários',
  matriculas: 'Matrículas', 'ficha-medica': 'Ficha Médica',
  monitor: 'Monitor', kiosk: 'Autoatendimento', presence: 'Presença Diária', history: 'Histórico Geral',
  'horas-extras': 'Horas Extras', 'attendance-corrections': 'Correções de Presença', 'qr-checkin': 'Carteirinhas QR',
  calendario: 'Calendário', 'mural-fotos': 'Mural de Fotos', cardapio: 'Cardápio', diario: 'Diário',
  materias: 'Matérias/Disciplinas', frequencia: 'Frequência', 'cadastro-comunicados': 'Comunicados',
  financeiro: 'Financeiro', auditoria: 'Auditoria', 'system-updates': 'Atualizações', 'duplicidade-biometrica': 'Duplicidade Facial',
  settings: 'Configurações',
  // Family (alguns ids coincidem com o Admin acima, mesmo rótulo serve)
  acompanhamento: 'Acompanhamento', authorized: 'Autorizados', 'gerenciar-responsaveis': 'Responsáveis',
  registration: 'Dados Cadastrais', comunicados: 'Comunicados',
  // Developer (prefixo 'dev-' -- estado isolado do DeveloperLayout.jsx)
  'dev-schools': 'Gestão de Escolas', 'dev-logs': 'Logs de Erro', 'dev-support': 'Suporte',
  'dev-settings': 'Configurações (Dev)', 'dev-billing': 'Faturamento',
};

export function screenLabel(screen) {
  if (!screen) return null;
  return SCREEN_LABELS[screen] || screen;
}

// Versão abreviada de SCREEN_LABELS só pro título do Header no celular, onde
// sobra pouco espaço (entre o menu hambúrguer e o sino/emergência/sair). Só
// entram aqui as telas cujo nome completo é longo demais pra caber sem
// cortar -- as ausentes usam o nome completo normal (screenLabel), que já é
// curto o bastante ("Usuários", "Alunos", "Início" etc.).
export const SCREEN_LABELS_MOBILE = {
  users: 'Usuários',
  'gerenciar-funcionarios': 'Funcionários',
  'cadastro-funcionarios': 'Funcionário',
  'attendance-corrections': 'Correção',
  'duplicidade-biometrica': 'Duplicidade',
  materias: 'Matérias',
  'dev-settings': 'Config.',
};

export function screenLabelMobile(screen) {
  if (!screen) return null;
  return SCREEN_LABELS_MOBILE[screen] || screenLabel(screen);
}
