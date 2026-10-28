// Assistente de configuração da escola nova (PLANO_VALORIZACAO_ZELA.md, 1.1).
// Só calcula: recebe o que já existe na escola e diz o que falta. Nenhum
// passo grava nada; cada um leva para a tela que já faz aquilo.

export const PASSOS_ONBOARDING = [
  {
    id: 'turmas',
    titulo: 'Cadastrar as turmas',
    desc: 'As turmas organizam alunos, chamada, mural e relatórios.',
    aba: 'cadastros-turma-nova',
  },
  {
    id: 'horarios',
    titulo: 'Definir horários e hora extra',
    desc: 'Tolerância de entrada e saída e como a hora extra é cobrada.',
    aba: 'config-financeiro',
    subaba: 'billing',
  },
  {
    id: 'mensalidades',
    titulo: 'Cadastrar os planos de mensalidade',
    desc: 'Valor de cada ciclo e turno do ano letivo.',
    aba: 'financeiro-planos',
  },
  {
    id: 'asaas',
    titulo: 'Conectar a conta Asaas',
    desc: 'Necessária para emitir boleto e Pix para as famílias.',
    aba: 'config-financeiro',
    subaba: 'gateway',
  },
  {
    id: 'equipe',
    titulo: 'Convidar a equipe',
    desc: 'Recepção, professoras e financeiro com o próprio acesso.',
    aba: 'cadastros-novo',
  },
];

const PASSOS_DO_FINANCEIRO = new Set(['horarios', 'mensalidades', 'asaas']);

// dados: { turmas, billingConfig, planos, gatewayConectado, equipe, financeiro }
// (turmas: array; planos e equipe: contagens; billingConfig: objeto).
export function calcularOnboarding(dados = {}) {
  const feito = {
    turmas: Array.isArray(dados.turmas) && dados.turmas.length > 0,
    horarios: !!dados.billingConfig && typeof dados.billingConfig === 'object' && Object.keys(dados.billingConfig).length > 0,
    mensalidades: (dados.planos || 0) > 0,
    asaas: dados.gatewayConectado === true,
    equipe: (dados.equipe || 0) > 0,
  };
  // Sem Financeiro as abas desses passos ficam bloqueadas: nem aparecem.
  const passos = PASSOS_ONBOARDING
    .filter(p => dados.financeiro !== false || !PASSOS_DO_FINANCEIRO.has(p.id))
    .map(p => ({ ...p, feito: feito[p.id] }));
  const concluidos = passos.filter(p => p.feito).length;
  return {
    passos,
    concluidos,
    total: passos.length,
    percentual: Math.round((concluidos / passos.length) * 100),
    proximo: passos.find(p => !p.feito) || null,
  };
}
