// Planos de mensalidade (04/10/2026): regras de preço, sem nenhuma
// dependência de Deno ou de navegador. É a ÚNICA fonte da conta: as Edge
// Functions (servidor) e as telas da Gestão importam este mesmo arquivo, então
// o valor mostrado na tela é sempre o que o servidor cobra.
//
// Preço da tabela = valor MENSAL por ciclo (6, 8 ou 10 horas) e turno
// (Matutino ou Vespertino). Trimestral, semestral e anual saem do mensal x
// meses do ciclo, com o desconto da família, sempre arredondado em centavos.

export const CICLOS_DE_HORAS = [6, 8, 10] as const;
export const TURNOS = ['Matutino', 'Vespertino'] as const;
export const CICLO_MESES = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUALLY: 6, YEARLY: 12 } as const;
export type PeriodicidadeDeCobranca = keyof typeof CICLO_MESES;
export type Turno = (typeof TURNOS)[number];

export const ROTULO_PERIODICIDADE: Record<PeriodicidadeDeCobranca, string> = {
  MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUALLY: 'Semestral', YEARLY: 'Anual',
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Turno do cadastro do aluno ("matutino", "Matutino ", "VESPERTINO"...).
export function normalizarTurno(valor: unknown): Turno | null {
  const t = semAcento(String(valor ?? ''));
  if (t === 'matutino') return 'Matutino';
  if (t === 'vespertino') return 'Vespertino';
  return null;
}

// Ciclo do cadastro do aluno (contracted_hours: 6, "6", "6.0", 8...).
export function normalizarCiclo(valor: unknown): 6 | 8 | 10 | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return (CICLOS_DE_HORAS as readonly number[]).includes(n) ? (n as 6 | 8 | 10) : null;
}

export function rotuloDoPlano(ciclo: number | null, turno: string | null): string {
  if (!ciclo && !turno) return 'sem ciclo e sem turno';
  return `${ciclo ? `${ciclo}h` : 'sem ciclo'} ${turno || 'sem turno'}`;
}

// Ciclo e turno que valem para o preço de um aluno, e o que falta.
export function planoDoAluno(aluno: { contracted_hours?: unknown; turno?: unknown } | null | undefined) {
  const ciclo = normalizarCiclo(aluno?.contracted_hours);
  const turno = normalizarTurno(aluno?.turno);
  const faltando: string[] = [];
  if (!ciclo) faltando.push('ciclo');
  if (!turno) faltando.push('turno');
  return { ciclo, turno, faltando };
}

// Valor de cada cobrança do ciclo, já com o desconto da família (centavos).
export function calcularValorDoCiclo(baseMensalCents: number, periodicidade: PeriodicidadeDeCobranca, descontoPercent = 0): number {
  const meses = CICLO_MESES[periodicidade];
  if (!meses) throw new Error('Periodicidade inválida.');
  const desconto = Number.isFinite(Number(descontoPercent)) ? Number(descontoPercent) : 0;
  return Math.round(baseMensalCents * meses * (1 - desconto / 100));
}

// Quanto fica por mês numa cobrança de vários meses.
export function valorMensalEquivalente(valorDoCicloCents: number, periodicidade: PeriodicidadeDeCobranca): number {
  return Math.round(valorDoCicloCents / CICLO_MESES[periodicidade]);
}

export interface PrecoDoPlano { school_year: number; ciclo_horas: number; turno: string; monthly_amount_cents: number }

export function procurarPreco(precos: PrecoDoPlano[] | null | undefined, ano: number, ciclo: number | null, turno: string | null): number | null {
  if (!ciclo || !turno) return null;
  const achado = (precos || []).find(p => Number(p.school_year) === Number(ano) && Number(p.ciclo_horas) === ciclo && p.turno === turno);
  return achado ? Number(achado.monthly_amount_cents) : null;
}

export function mensagemSemPreco(ciclo: number, turno: string, ano: number): string {
  return `Cadastre o preço de ${ciclo}h ${turno} de ${ano} em Financeiro · Planos.`;
}

// Ano do preço: o informado, senão o do 1º vencimento (a mensalidade de
// janeiro de 2027 usa a tabela de 2027).
export function anoDoPreco(primeiroVencimento: string, anoInformado?: number | null): number {
  if (anoInformado && Number.isInteger(anoInformado)) return anoInformado;
  return Number(String(primeiroVencimento).slice(0, 4));
}

// 1º vencimento padrão da criação automática: o próximo dia `dia` que ainda
// não passou. Datas como texto AAAA-MM-DD, sem fuso.
export function primeiroVencimentoPadrao(hoje: string, dia: number): string {
  const [a, m, d] = hoje.split('-').map(Number);
  let ano = a;
  let mes = m;
  if (d >= dia) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } }
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export type SituacaoDaMensalidade =
  | 'pronto' | 'ja_tem' | 'bolsista' | 'sem_plano' | 'sem_preco' | 'sem_responsavel' | 'sem_documento';

export const ROTULO_SITUACAO_DA_MENSALIDADE: Record<SituacaoDaMensalidade, string> = {
  pronto: 'Pronto',
  ja_tem: 'Já tem mensalidade',
  bolsista: 'Bolsista, sem cobrança',
  sem_plano: 'Sem ciclo ou turno',
  sem_preco: 'Sem preço na tabela',
  sem_responsavel: 'Sem responsável financeiro',
  sem_documento: 'Responsável sem CPF',
};

export interface EntradaDaMensalidade {
  aluno: { contracted_hours?: unknown; turno?: unknown };
  precos: PrecoDoPlano[];
  ano: number;
  temContratoAtivo: boolean;
  temResponsavel: boolean;
  responsavelTemDocumento: boolean;
  bolsista: boolean;
  descontoPercent: number;
  periodicidade?: PeriodicidadeDeCobranca;
}

// O que acontece com o aluno na lista "aguardando mensalidade" e na criação
// automática. Mesma regra nos dois lugares.
export function avaliarMensalidadeDoAluno(e: EntradaDaMensalidade) {
  const periodicidade = e.periodicidade || 'MONTHLY';
  const plano = planoDoAluno(e.aluno);
  const base = { ciclo: plano.ciclo, turno: plano.turno, ano: e.ano, periodicidade };
  if (e.temContratoAtivo) return { ...base, situacao: 'ja_tem' as SituacaoDaMensalidade };
  if (e.bolsista) return { ...base, situacao: 'bolsista' as SituacaoDaMensalidade };
  if (plano.faltando.length) return { ...base, situacao: 'sem_plano' as SituacaoDaMensalidade, faltando: plano.faltando };
  if (!e.temResponsavel) return { ...base, situacao: 'sem_responsavel' as SituacaoDaMensalidade };
  if (!e.responsavelTemDocumento) return { ...base, situacao: 'sem_documento' as SituacaoDaMensalidade };
  const mensal = procurarPreco(e.precos, e.ano, plano.ciclo, plano.turno);
  if (mensal === null) return { ...base, situacao: 'sem_preco' as SituacaoDaMensalidade };
  const valorDoCiclo = calcularValorDoCiclo(mensal, periodicidade, e.descontoPercent);
  return { ...base, situacao: 'pronto' as SituacaoDaMensalidade, mensalCents: mensal, descontoPercent: e.descontoPercent, valorDoCicloCents: valorDoCiclo };
}

// Reajuste: novo mensal por percentual (arredonda em centavos).
export function aplicarPercentual(mensalCents: number, percentual: number): number {
  return Math.max(1, Math.round(mensalCents * (1 + percentual / 100)));
}
