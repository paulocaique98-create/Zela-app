// Catálogo dos módulos contratados (Portal do Dev · Módulos, Modelo 3,
// 28/09/2026). A escola contrata o plano base, módulos INTEIROS (nunca um
// submenu solto), adicionais avulsos e, só pelo time Zela, chaves técnicas.
// Cada item liga/desliga um conjunto de chaves de schools.features_enabled,
// que é o que os portais leem; os nomes das chaves não mudam.
//
// "onde" descreve só os menus que de fato dependem da chave (conferido nos
// portais em 28/09/2026); a Gestão vê várias telas independente do módulo.

export const GRUPOS = [
  { key: 'base', label: 'Base' },
  { key: 'modulo', label: 'Módulos' },
  { key: 'adicional', label: 'Adicionais' },
  { key: 'tecnico', label: 'Técnico · só Dev' },
];

export const ITENS = [
  {
    id: 'base',
    grupo: 'base',
    nome: 'Plano base',
    resumo: 'Sempre incluso. O que toda escola usa no dia a dia, inclusive receber as mensalidades.',
    // 01/10/2026: Financeiro e Contratos entraram no plano base (toda escola
    // recebe mensalidade e tem contrato assinado pelo app, em qualquer plano).
    keys: ['cadastros', 'gerenciamento', 'formularios', 'checkin', 'comunicados', 'calendario', 'configuracoes', 'financeiro'],
    fixo: true,
    inclui: [
      { nome: 'Cadastros e usuários', desc: 'Famílias, alunos, funcionários e acessos' },
      { nome: 'Matrículas e ficha médica', desc: 'Formulários preenchidos pelas famílias' },
      { nome: 'Entrada e saída', desc: 'Totem com reconhecimento facial, monitor, presença do dia e histórico' },
      { nome: 'Comunicados e calendário', desc: 'Avisos da escola e datas do ano letivo' },
      { nome: 'Contratos e assinatura pelo app', desc: 'Contratos e aditivos assinados pela família' },
      { nome: 'Financeiro', desc: 'Mensalidades, cobranças por boleto e Pix, recebimentos, inadimplência e, no futuro, nota fiscal' },
      { nome: 'Configurações', desc: 'Dados da escola e preferências do portal' },
    ],
    onde: [
      { portal: 'Recepção', menus: 'Gerenciamento · Check-in/out · Formulários · Calendário · Comunicados · Configurações' },
      { portal: 'Gestão', menus: 'Cadastros · Secretaria · Contratos · Financeiro · Check-in/out · Calendário · Comunicados · Configurações' },
      { portal: 'Família', menus: 'Check-in/out · Acadêmico · Relatórios · Formulários · Gerenciamento · Financeiro · Configurações › Contratos' },
    ],
    aviso: 'Para emitir cobranças, a escola conecta a conta de pagamento em Gestão › Configurações › Financeiro.',
    aoDesligar: null,
  },
  {
    id: 'pedagogico',
    grupo: 'modulo',
    nome: 'Pedagógico',
    resumo: 'Registros e relatórios de desenvolvimento das crianças.',
    keys: ['relatorios_pedagogicos', 'frequencia', 'materias'],
    metodos: ['montessori', 'personalizado'],
    inclui: [
      { nome: 'Relatórios de desenvolvimento', desc: 'Mitigação e Mapa de Habilidades, preenchidos pelas professoras' },
      { nome: 'Frequência', desc: 'Chamada por turma e por dia' },
      { nome: 'Matérias', desc: 'Áreas de conhecimento ligadas às turmas' },
    ],
    onde: [
      { portal: 'Professor', menus: 'Frequência · Relatórios' },
      { portal: 'Recepção', menus: 'Relatórios · Acadêmico › Frequência e Matérias' },
      { portal: 'Gestão', menus: 'Acadêmico › Frequência, Pedagógico e Matérias' },
      { portal: 'Família', menus: 'Relatórios' },
    ],
    aoDesligar: 'As professoras deixam de ver Frequência e Relatórios, e a família deixa de ver os Relatórios. O que já foi registrado fica guardado.',
  },
  {
    // Sistema pedagógico próprio da escola Tradicional (PLANO_METODO_TRADICIONAL.md).
    // Cada fase cria as chaves dela (sempre lidas como `=== true`, nascem
    // desligadas). Não mexe no 'pedagogico' acima, que é do Montessori.
    id: 'pedagogico_tradicional',
    grupo: 'modulo',
    nome: 'Pedagógico Tradicional',
    resumo: 'Notas, diário de classe, boletim e resultado final para a escola de método tradicional.',
    keys: ['estrutura_academica_tradicional', 'avaliacao_tradicional', 'diario_classe_tradicional', 'tarefas_tradicional'],
    metodos: ['tradicional', 'personalizado'],
    inclui: [
      { nome: 'Estrutura acadêmica', desc: 'Séries, turmas, disciplinas, grade curricular, professores por turma e quadro de horários' },
      { nome: 'Avaliação', desc: 'Período e média mínima da escola, provas e trabalhos com peso, lançamento de notas pelo professor e recuperação' },
      { nome: 'Diário de classe', desc: 'Aula dada com conteúdo, chamada por disciplina e alerta de frequência abaixo de 75% (LDB art. 24)' },
      { nome: 'Tarefas', desc: 'O professor publica tarefas com data de entrega por turma e disciplina; a família lê as do filho' },
      { nome: 'Boletim e resultado final', desc: 'Regra de aprovação personalizável pela escola, fechamento do resultado pela Coordenação e Direção e boletim para a família' },
    ],
    onde: [
      { portal: 'Gestão', menus: 'Acadêmico › Estrutura acadêmica, Avaliação, Frequência por disciplina, Boletim e resultado, Ata do conselho (só Coordenação e Direção)' },
      { portal: 'Professor', menus: 'Notas, Diário de classe, Tarefas' },
    ],
    aoDesligar: 'Estrutura acadêmica, Avaliação, Frequência por disciplina, Notas e Diário de classe somem dos menus. O que já foi cadastrado e lançado fica guardado.',
  },
  {
    // Vale para todos os métodos (Montessori e Tradicional). Nasce desligado e
    // fora dos pacotes: a escola liga pelo Portal do Dev.
    id: 'plano_aula',
    grupo: 'modulo',
    nome: 'Plano de aula',
    resumo: 'A professora planeja as aulas do período e a Coordenação aprova ou devolve com comentário.',
    keys: ['plano_aula'],
    inclui: [
      { nome: 'Plano do período', desc: 'Objetivos, conteúdo, metodologia, recursos e avaliação, com anexos' },
      { nome: 'Revisão', desc: 'Fila Para revisar da Coordenação e Direção, com aprovar ou devolver com comentário' },
    ],
    onde: [
      { portal: 'Professor', menus: 'Acadêmico › Planos de aula' },
      { portal: 'Gestão', menus: 'Acadêmico › Planos de aula (Coordenação e Direção)' },
    ],
    aoDesligar: 'Planos de aula somem dos menus. Os planos já escritos ficam guardados.',
  },
  {
    // Nasce desligado e fora dos pacotes: a escola liga pelo Portal do Dev.
    id: 'ocorrencias',
    grupo: 'modulo',
    nome: 'Ocorrências completas',
    resumo: 'Registro de ocorrências do aluno, com gravidade, providências e ciência da família.',
    keys: ['ocorrencias'],
    inclui: [
      { nome: 'Registro pela professora', desc: 'Comportamento, saúde, acidente, disciplinar, elogio, com anexos e alerta da ficha médica' },
      { nome: 'Linha do tempo da Gestão', desc: 'Filtros por tipo, gravidade e turma, edição com histórico de versões e medida disciplinar' },
      { nome: 'Ciência da família', desc: 'Push e confirmação pelo responsável; ocorrência interna nunca aparece para a família' },
    ],
    onde: [
      { portal: 'Professor', menus: 'Acadêmico › Ocorrências' },
      { portal: 'Gestão', menus: 'Acadêmico › Ocorrências e aba Ocorrências no perfil do aluno (Coordenação e Direção)' },
      { portal: 'Família', menus: 'Acadêmico › Ocorrências' },
    ],
    aoDesligar: 'Os menus somem e a família deixa de ver. Ocorrências e anexos ficam guardados.',
  },
  {
    // Nasce desligado e fora dos pacotes: a escola liga pelo Portal do Dev.
    id: 'avaliacao_institucional',
    grupo: 'modulo',
    nome: 'Avaliação institucional',
    resumo: 'Pesquisas de satisfação para as famílias e para a equipe, com resultado em gráfico.',
    keys: ['avaliacao_institucional'],
    inclui: [
      { nome: 'Pesquisas', desc: 'NPS, escala de 1 a 5, múltipla escolha e texto livre, para todas as famílias, turmas escolhidas ou a equipe' },
      { nome: 'Resposta anônima', desc: 'O Zela não guarda quem deu cada resposta; resultado por turma só com 5 ou mais respostas' },
      { nome: 'Resultados', desc: 'Taxa de resposta, gráfico por pergunta, comentários e exportação' },
    ],
    onde: [
      { portal: 'Gestão', menus: 'Comunicação › Pesquisas (Coordenação e Direção)' },
      { portal: 'Professor', menus: 'Acadêmico › Pesquisas e aviso na Início' },
      { portal: 'Família', menus: 'Acadêmico › Pesquisas e aviso na Início' },
    ],
    aoDesligar: 'Os menus somem e ninguém mais responde. Pesquisas e respostas ficam guardadas.',
  },
  {
    id: 'rotina',
    grupo: 'modulo',
    nome: 'Rotina e família',
    resumo: 'O dia da criança compartilhado com a família.',
    keys: ['diario', 'mural', 'cardapio'],
    inclui: [
      { nome: 'Diário', desc: 'Refeições, sono e evacuação de cada criança' },
      { nome: 'Mural de fotos', desc: 'Fotos por turma' },
      { nome: 'Cardápio', desc: 'Cardápio semanal da escola' },
    ],
    onde: [
      { portal: 'Recepção', menus: 'Acadêmico › Mural, Cardápio e Diário' },
      { portal: 'Gestão', menus: 'Acadêmico › Cardápio e Diário · Comunicação › Mural' },
      { portal: 'Família', menus: 'Mural de Fotos · Cardápio · Diário' },
    ],
    aoDesligar: 'A família deixa de ver Diário, Mural e Cardápio. O que já foi publicado fica guardado.',
  },
  {
    id: 'chat',
    grupo: 'adicional',
    nome: 'Chat',
    resumo: 'Conversa da família com os setores da escola.',
    keys: ['chat'],
    inclui: [
      { nome: 'Chat com a escola', desc: 'Família fala com Recepção, Coordenação e demais setores' },
      { nome: 'Suporte Zela', desc: 'A escola fala com o suporte pelo mesmo chat' },
    ],
    onde: [
      { portal: 'Recepção', menus: 'Chat' },
      { portal: 'Gestão', menus: 'Chat (Coordenação e Direção)' },
      { portal: 'Família', menus: 'Chat' },
    ],
    aoDesligar: 'O chat some para a escola e para a família. As conversas ficam guardadas.',
  },
  {
    id: 'bi_dashboards',
    grupo: 'adicional',
    nome: 'Dashboard',
    resumo: 'Gráficos interativos de financeiro e frequência, com filtros, detalhe e exportação.',
    keys: ['bi_dashboards'],
    inclui: [
      { nome: 'Visão geral', desc: 'Alunos, recebido, inadimplência e frequência por turma' },
      { nome: 'Financeiro', desc: 'Previsto x recebido, atraso por faixa, despesas e resultado (só Gestão)' },
    ],
    onde: [{ portal: 'Gestão', menus: 'Relatórios › Dashboard (a Coordenação vê sem valores em R$)' }],
    aoDesligar: 'O item Dashboard some do menu. Nada é apagado.',
  },
  {
    id: 'financeiro_avancado',
    grupo: 'adicional',
    nome: 'Financeiro avançado',
    resumo: 'DRE e fluxo de caixa projetado para a Gestão.',
    keys: ['financeiro_avancado'],
    inclui: [
      { nome: 'DRE', desc: 'Receitas, despesas por grupo e resultado por mês, em regime de caixa ou competência' },
      { nome: 'Fluxo de caixa', desc: 'Saldo projetado por semana para 30, 60 ou 90 dias, com faixa otimista e pessimista' },
    ],
    onde: [{ portal: 'Gestão', menus: 'Financeiro › DRE e Fluxo de caixa (só a Gestão)' }],
    aoDesligar: 'Os itens DRE e Fluxo de caixa somem do menu. Nada é apagado.',
  },
  {
    id: 'biblioteca',
    grupo: 'adicional',
    nome: 'Biblioteca',
    resumo: 'Acervo, empréstimos e atrasos de livros para alunos e equipe.',
    keys: ['biblioteca'],
    inclui: [
      { nome: 'Acervo', desc: 'Livros e exemplares com tombo, importação por planilha e leitura de código' },
      { nome: 'Empréstimos', desc: 'Empréstimo e devolução para aluno ou funcionário, com prazo e atrasados' },
      { nome: 'Aviso à família', desc: 'Push um dia antes do prazo e no atraso' },
    ],
    onde: [
      { portal: 'Gestão', menus: 'Biblioteca › Acervo, Empréstimos e Atrasados (Coordenação e Direção também)' },
      { portal: 'Recepção', menus: 'Gestão › Biblioteca (acesso completo; a Gestão pode retirar)' },
      { portal: 'Família', menus: 'Biblioteca' },
    ],
    aoDesligar: 'O menu Biblioteca some para a escola e para a família. Acervo e histórico ficam guardados.',
  },
  {
    id: 'estoque',
    grupo: 'adicional',
    nome: 'Estoque',
    resumo: 'Controle de material da escola, com entradas, saídas e aviso de estoque baixo.',
    keys: ['estoque'],
    inclui: [
      { nome: 'Itens', desc: 'Material pedagógico, de limpeza, cozinha e uniforme, com unidade e mínimo' },
      { nome: 'Movimentações', desc: 'Entradas, saídas e ajustes com histórico que não se apaga' },
      { nome: 'Abaixo do mínimo', desc: 'Lista dos itens que precisam de reposição' },
    ],
    onde: [{ portal: 'Gestão', menus: 'Estoque › Itens, Movimentações e Abaixo do mínimo (Coordenação e Direção também)' }],
    aoDesligar: 'O menu Estoque some. Itens e histórico ficam guardados.',
  },
  {
    id: 'liveness',
    grupo: 'adicional',
    nome: 'Prova de vida no reconhecimento',
    resumo: 'Detecta foto ou tela apontada para a câmera do totem.',
    keys: ['liveness_detection'],
    inclui: [
      { nome: 'Modo observador', desc: 'Registra as suspeitas em Logs de erro, sem bloquear ninguém' },
    ],
    onde: [{ portal: 'Recepção', menus: 'Totem de autoatendimento' }],
    aviso: 'Sozinho, só observa. Para recusar de verdade, ligue "Bloqueio da prova de vida" em Técnico.',
    aoDesligar: 'O totem para de checar foto e tela. O bloqueio da prova de vida também é desligado.',
  },
  {
    id: 'qr',
    grupo: 'adicional',
    nome: 'Entrada por QR Code',
    resumo: 'QR de cada aluno no totem, com um toque de confirmação.',
    keys: ['qr_checkin'],
    inclui: [
      { nome: 'Carteirinhas QR', desc: 'QR individual de cada aluno para imprimir' },
      { nome: 'Leitura no totem', desc: 'Alternativa ao reconhecimento facial' },
    ],
    onde: [{ portal: 'Recepção', menus: 'Check-in/out › Carteirinhas QR · Totem' }],
    aoDesligar: 'O totem deixa de aceitar QR Code. As carteirinhas impressas param de funcionar.',
  },
  {
    id: 'liveness_bloqueio',
    grupo: 'tecnico',
    nome: 'Bloqueio da prova de vida',
    resumo: 'Passa a recusar de verdade suspeitas de foto ou tela.',
    keys: ['liveness_detection_enforce'],
    requer: 'liveness',
    inclui: [
      { nome: 'Recusa no totem', desc: 'A pessoa cai no Senha/QR de sempre' },
    ],
    onde: [{ portal: 'Recepção', menus: 'Totem de autoatendimento' }],
    aviso: 'Só ligar depois de revisar os dados do modo observador em Logs de erro.',
    aoDesligar: 'A prova de vida volta a só observar.',
  },
  {
    id: 'motor_human',
    grupo: 'tecnico',
    nome: 'Motor facial Human (beta)',
    resumo: 'Troca o motor que decide o reconhecimento facial.',
    keys: ['face_engine_human'],
    inclui: [
      { nome: 'Motor @vladmandic/human', desc: 'Pessoas sem o descritor novo seguem no motor antigo' },
    ],
    onde: [{ portal: 'Recepção', menus: 'Totem de autoatendimento' }],
    aviso: 'Só ativar depois de validar o modo observador (PLANO_MIGRACAO_BIBLIOTECA_RECONHECIMENTO_FACIAL.md, Fases C e D).',
    aoDesligar: 'Volta ao motor face-api.js.',
  },
  {
    id: 'assistente_configuracao',
    grupo: 'tecnico',
    nome: 'Primeiros passos (implantação)',
    resumo: 'Lista do que falta configurar na escola nova, com progresso.',
    keys: ['assistente_configuracao'],
    inclui: [
      { nome: 'Passo a passo', desc: 'Turmas, horários, mensalidades, conta Asaas e equipe' },
    ],
    onde: [{ portal: 'Gestão', menus: 'Primeiros passos' }],
    aviso: 'Ligar durante a implantação e desligar quando a escola estiver configurada.',
    aoDesligar: 'O item Primeiros passos some do menu da Gestão. Nada é apagado.',
  },
];

export const ITEM_POR_ID = Object.fromEntries(ITENS.map(i => [i.id, i]));
const TODAS_AS_CHAVES = ITENS.flatMap(i => i.keys);

// Pacotes: o que vai ligado além do plano base (que já inclui Financeiro e
// Contratos). Técnico nunca entra em pacote.
export const PACOTES = [
  { id: 'essencial', nome: 'Essencial', itens: [] },
  { id: 'completo', nome: 'Completo', itens: ['pedagogico', 'rotina'] },
  { id: 'premium', nome: 'Completo Volume', itens: ['pedagogico', 'rotina', 'chat', 'liveness', 'qr', 'bi_dashboards'] },
];
const VENDAVEIS = ITENS.filter(i => (i.grupo === 'modulo' || i.grupo === 'adicional') && i.keys.length);

// O que a tela de Módulos do Dev mostra para a escola: item com `metodos` só
// aparece nesses métodos. Nunca esconde o que já está ligado (ou parcial) nem
// quando o método é desconhecido. Só afeta a exibição; não muda nenhuma chave.
export function itemVisivelNoMetodo(item, method, features) {
  if (!item.metodos || !method || item.metodos.includes(method)) return true;
  return estadoDoItem(features, item) !== 'off';
}

// 'on' | 'off' | 'parcial' (escola antiga com só parte das chaves ligadas).
export function estadoDoItem(features, item) {
  if (!item.keys.length) return 'off';
  const ligadas = item.keys.filter(k => features?.[k] === true).length;
  if (ligadas === 0) return 'off';
  return ligadas === item.keys.length ? 'on' : 'parcial';
}

export function ligarItem(features, itemId, ligado) {
  const item = ITEM_POR_ID[itemId];
  if (!item || item.fixo || item.emBreve) return features;
  if (ligado && item.requer && estadoDoItem(features, ITEM_POR_ID[item.requer]) !== 'on') return features;
  const next = { ...features };
  for (const k of item.keys) next[k] = ligado;
  // Quem depende deste item desliga junto.
  if (!ligado) {
    for (const dep of ITENS.filter(i => i.requer === itemId)) for (const k of dep.keys) next[k] = false;
  }
  return next;
}

// Base sempre ligada; chaves que a tela conhece sempre com true/false.
export function normalizarFeatures(features) {
  const next = { ...features };
  for (const k of TODAS_AS_CHAVES) next[k] = next[k] === true;
  for (const k of ITEM_POR_ID.base.keys) next[k] = true;
  return next;
}

export function pacoteAtual(features, pacotes = PACOTES) {
  const ligados = new Set(VENDAVEIS.filter(i => estadoDoItem(features, i) === 'on').map(i => i.id));
  const algumParcial = VENDAVEIS.some(i => estadoDoItem(features, i) === 'parcial');
  if (algumParcial) return 'livre';
  const pacote = pacotes.find(p => p.itens.length === ligados.size && p.itens.every(id => ligados.has(id)));
  return pacote ? pacote.id : 'livre';
}

export function aplicarPacote(features, pacoteId, pacotes = PACOTES) {
  const pacote = pacotes.find(p => p.id === pacoteId);
  if (!pacote) return features;
  let next = normalizarFeatures(features);
  for (const item of VENDAVEIS) next = ligarItem(next, item.id, pacote.itens.includes(item.id));
  return next;
}

// Generaliza aplicarPacote: liga o base e os itens informados e desliga os
// demais itens vendáveis (usado pelos planos do menu Planos).
export function aplicarItens(features, itemIds) {
  const ids = new Set(itemIds || []);
  let next = normalizarFeatures(features);
  for (const item of VENDAVEIS) next = ligarItem(next, item.id, ids.has(item.id));
  return next;
}

// REGRA (definida pelo usuário em 28/09/2026): todo módulo, adicional ou
// chave que precise ser ativado começa DESATIVADO. Escola nova nasce só com
// o plano base (que não se ativa: é sempre incluso). Um item novo no
// catálogo também nasce desligado, e nos portais a chave dele deve ser lida
// como `features.x === true` (ausente = desligado), nunca `!== false`.
// Garantido por teste em modulosCatalogo.test.js.
export function featuresIniciais() {
  return aplicarPacote({}, 'essencial');
}

// Histórico: agrupa as linhas de school_feature_changes de um item por
// momento (uma mudança de módulo mexe em várias chaves ao mesmo tempo).
export function historicoDoItem(changes, item) {
  const keys = new Set(item.keys);
  const grupos = new Map();
  for (const c of changes) {
    if (!keys.has(c.feature_key)) continue;
    const quando = String(c.changed_at).slice(0, 19);
    const id = `${quando}|${c.enabled}`;
    if (!grupos.has(id)) grupos.set(id, { quando: c.changed_at, ligado: c.enabled, autor: c.changed_by_name || null, chaves: [] });
    grupos.get(id).chaves.push(c.feature_key);
  }
  return [...grupos.values()]
    .map(g => ({ ...g, completo: g.chaves.length === item.keys.length }))
    .sort((a, b) => new Date(b.quando) - new Date(a.quando));
}
