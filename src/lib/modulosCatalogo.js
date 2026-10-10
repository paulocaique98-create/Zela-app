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
      { nome: 'Entrada e saída', desc: 'Totem, monitor, presença do dia e histórico' },
      { nome: 'Comunicados e calendário', desc: 'Avisos da escola e datas do ano letivo' },
      { nome: 'Contratos e assinatura pelo app', desc: 'Contratos e aditivos assinados pela família' },
      { nome: 'Financeiro', desc: 'Mensalidades, cobranças por boleto e Pix, recebimentos, inadimplência e, no futuro, nota fiscal' },
      { nome: 'Configurações', desc: 'Dados da escola e preferências do portal' },
    ],
    onde: [
      { portal: 'Recepção', menus: 'Cadastros · Gerenciamento · Formulários · Check-in/out · Calendário · Comunicados · Configurações' },
      { portal: 'Gestão', menus: 'Secretaria · Contratos · Financeiro · Presença e Horas · Cadastros · Calendário · Comunicados · Configurações' },
      { portal: 'Família', menus: 'Formulários · Gerenciamento · Check-in/out · Calendário · Comunicados · Financeiro · Configurações › Contratos' },
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

// Pacotes: o que vai ligado além do plano base (que já inclui Financeiro e
// Contratos). Técnico nunca entra em pacote.
export const PACOTES = [
  { id: 'essencial', nome: 'Essencial', itens: [] },
  { id: 'completo', nome: 'Completo', itens: ['pedagogico', 'rotina'] },
  { id: 'premium', nome: 'Premium', itens: ['pedagogico', 'rotina', 'chat', 'liveness', 'qr'] },
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
