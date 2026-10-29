// Desconto total de uma mensalidade somando o desconto da família e as bolsas vigentes
// (PLANO_EXPANSAO_GESTAO.md, item 13). Única fonte da regra: o servidor calcula, a tela só mostra.
//   · Bolsa em valor vira percentual sobre o mensal base (nunca passa de 100%).
//   · As bolsas somam entre si.
//   · Se alguma bolsa for não cumulativa, o desconto da família não soma: vale o maior dos dois.
//   · O total respeita o limite da escola (padrão 100%).

export interface BolsaVigente {
  percentual: number | null;
  valor_cents: number | null;
  cumulativa: boolean;
}

export interface DescontoTotal {
  total: number;          // percentual final aplicado no contrato
  bolsa: number;          // parte vinda das bolsas (depois do limite)
  limitado: boolean;      // true quando o limite da escola cortou o desconto
}

const arredonda = (n: number) => Math.round(n * 100) / 100;

export function percentualDaBolsa(bolsa: BolsaVigente, baseMensalCents: number): number {
  if (bolsa.percentual !== null && bolsa.percentual !== undefined) return Number(bolsa.percentual);
  if (!bolsa.valor_cents || !(baseMensalCents > 0)) return 0;
  return Math.min(100, (Number(bolsa.valor_cents) / baseMensalCents) * 100);
}

export function descontoComBolsas(
  baseMensalCents: number,
  descontoFamiliaPercent: number,
  bolsas: BolsaVigente[],
  limitePercent = 100,
): DescontoTotal {
  const familia = Number.isFinite(Number(descontoFamiliaPercent)) ? Number(descontoFamiliaPercent) : 0;
  const limite = Number.isFinite(Number(limitePercent)) && Number(limitePercent) > 0 ? Math.min(100, Number(limitePercent)) : 100;
  const somaBolsas = bolsas.reduce((acc, b) => acc + percentualDaBolsa(b, baseMensalCents), 0);
  if (bolsas.length === 0) return { total: arredonda(Math.min(familia, 100)), bolsa: 0, limitado: false };

  const naoCumulativa = bolsas.some((b) => !b.cumulativa);
  const bruto = naoCumulativa ? Math.max(familia, somaBolsas) : familia + somaBolsas;
  const total = Math.min(bruto, limite);
  return { total: arredonda(total), bolsa: arredonda(Math.min(somaBolsas, total)), limitado: bruto > limite };
}

// Bolsa vigente na data: não encerrada, já iniciada e sem fim vencido.
export function bolsaVigenteEm(g: { inicio: string; fim: string | null; encerrada_em: string | null }, dataISO: string): boolean {
  if (g.encerrada_em) return false;
  if (g.inicio > dataISO) return false;
  return !g.fim || g.fim >= dataISO;
}
