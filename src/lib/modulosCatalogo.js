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
    resumo: 'Sempre incluso. O que toda escola usa no dia a dia.',
    keys: ['cadastros', 'gerenciamento', 'formularios', 'checkin', 'comunicados', 'calendario', 'configuracoes'],
    fixo: true,
    inclui: [
      { nome: 'Cadastros e usuários', desc: 'Famílias, alunos, funcionários e acessos' },
      { nome: 'Matrículas e ficha médica', desc: 'Formulários preenchidos pelas famílias' },
      { nome: 'Entrada e saída', desc: 'Totem, monitor, presença do dia e histórico' },
      { nome: 'Comunicados e calendário', desc: 'Avisos da escola e datas do ano letivo' },
      { nome: 'Configurações', desc: 'Dados da escola e preferências do portal' },
    ],
    onde: [
      { portal: 'Recepção', menus: 'Cadastros · Gerenciamento · Formulários · Check-in/out · Calendário · Comunicados · Configurações' },
      { portal: 'Gestão', menus: 'Presença e Horas' },
      { portal: 'Família', menus: 'Formulários · Gerenciamento · Check-in/out · Calendário · Comunicados · Configurações' },
    ],
    aoDesligar: null,
  },
  {
    id: 'pedagogico',
    grupo: 'modulo',
    nome: 'Pedagógico',
    resumo: 'Registros e relatórios de desenvolvimento das crianças.',
    keys: ['relatorios_pedagogicos', 'frequencia', 'materias'],
    inclui: [
      { nome: 'Relatórios de desenvolvimento', desc: 'Semestral e Mitigação, preenchidos pelas professoras' },
      { nome: 'Frequência', desc: 'Chamada por turma e por dia' },
      { nome: 'Matérias', desc: 'Áreas de conhecimento ligadas às turmas' },
    ],
    onde: [
      { portal: 'Professor', menus: 'Frequência · Relatórios' },
      { portal: 'Recepção', menus: 'Relatórios · Acadêmico › Frequência e Matérias' },
      { portal: 'Família', menus: 'Relatórios' },
    ],
    aoDesligar: 'As professoras deixam de ver Frequência e Relatórios, e a família deixa de ver os Relatórios. O que já foi registrado fica guardado.',
  },
  {
    id: 'rotina',
    grupo: 'modulo',
    nome: 'Rotina e família',
    resumo: 'O dia da criança compartilhado com a família.',
    keys: ['diario', 'mural', 'cardapio', 'chat'],
    inclui: [
      { nome: 'Diário', desc: 'Refeições, sono e evacuação de cada criança' },
      { nome: 'Mural de fotos', desc: 'Fotos por turma' },
      { nome: 'Cardápio', desc: 'Cardápio semanal da escola' },
      { nome: 'Chat', desc: 'Conversa da família com os setores da escola e com o suporte Zela' },
    ],
    onde: [
      { portal: 'Recepção', menus: 'Acadêmico › Mural, Cardápio e Diário · Chat' },
      { portal: 'Família', menus: 'Mural de Fotos · Cardápio · Diário · Chat' },
    ],
    aoDesligar: 'A família deixa de ver Diário, Mural, Cardápio e Chat. O que já foi publicado fica guardado.',
  },
  {
    id: 'financeiro',
    grupo: 'modulo',
    nome: 'Financeiro',
    resumo: 'Contratos, mensalidades e cobrança automática.',
    keys: ['financeiro'],
    inclui: [
      { nome: 'Mensalidades', desc: 'Plano de mensalidade de cada aluno' },
      { nome: 'Cobranças', desc: 'Boleto e Pix emitidos pela conta de pagamento da escola' },
      { nome: 'Inadimplência', desc: 'Quem está com cobrança em atraso' },
      { nome: 'Recebimentos e conciliação', desc: 'O que entrou e o que falta conferir' },
    ],
    onde: [
      { portal: 'Gestão', menus: 'Financeiro › Mensalidades, Cobranças, Inadimplência e Recebimentos' },
      { portal: 'Família', menus: 'Financeiro (só o responsável financeiro)' },
    ],
    aviso: 'Para emitir cobranças, a escola conecta a conta de pagamento em Gestão › Configurações › Financeiro.',
    aoDesligar: 'A Gestão deixa de ver as telas de cobrança e a família deixa de ver o Financeiro. Cobranças já emitidas não são canceladas.',
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
    id: 'app_marca',
    grupo: 'adicional',
    nome: 'App com a marca da escola',
    resumo: 'Disponível depois do lançamento dos apps.',
    keys: [],
    emBreve: true,
    inclui: [],
    onde: [],
    aoDesligar: null,
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
];

export const ITEM_POR_ID = Object.fromEntries(ITENS.map(i => [i.id, i]));
const TODAS_AS_CHAVES = ITENS.flatMap(i => i.keys);

// Pacotes: o que vai ligado além do plano base. Técnico nunca entra em pacote.
export const PACOTES = [
  { id: 'essencial', nome: 'Essencial', itens: [] },
  { id: 'completo', nome: 'Completo', itens: ['pedagogico', 'rotina'] },
  { id: 'premium', nome: 'Premium', itens: ['pedagogico', 'rotina', 'financeiro', 'liveness', 'qr'] },
];
const VENDAVEIS = ITENS.filter(i => (i.grupo === 'modulo' || i.grupo === 'adicional') && i.keys.length);

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

export function pacoteAtual(features) {
  const ligados = new Set(VENDAVEIS.filter(i => estadoDoItem(features, i) === 'on').map(i => i.id));
  const algumParcial = VENDAVEIS.some(i => estadoDoItem(features, i) === 'parcial');
  if (algumParcial) return 'livre';
  const pacote = PACOTES.find(p => p.itens.length === ligados.size && p.itens.every(id => ligados.has(id)));
  return pacote ? pacote.id : 'livre';
}

export function aplicarPacote(features, pacoteId) {
  const pacote = PACOTES.find(p => p.id === pacoteId);
  if (!pacote) return features;
  let next = normalizarFeatures(features);
  for (const item of VENDAVEIS) next = ligarItem(next, item.id, pacote.itens.includes(item.id));
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
