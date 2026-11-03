// Regras puras do faturamento do Zela Edu (PLANO_FATURAMENTO_ZELA.md, itens 6 e 7): cobrança da escola
// ao Zela, na conta oficial do Zela no Asaas (não a da escola). Sem imports de propósito: roda igual
// no Deno (create-zela-charge e zela-billing-webhook) e no vitest (src/test/zelaBilling.test.js).

export type StatusCobrancaZela = 'pendente' | 'paga' | 'vencida' | 'cancelada' | 'estornada';

export interface CobrancaZelaParaAsaas {
  id: string;
  tipo: 'parcela' | 'implantacao';
  numero: number;
  vencimento: string;
  valor: number | string;
}

export interface MultaJurosZela {
  multa_percent: number | string;
  juros_mensal_percent: number | string;
}

const toNum = (v: unknown) => Number(v);

export function descricaoCobranca(c: Pick<CobrancaZelaParaAsaas, 'tipo' | 'numero'>, totalParcelas: number): string {
  if (c.tipo === 'implantacao') return 'Zela Edu: implantação';
  return totalParcelas > 1 ? `Zela Edu: parcela ${c.numero} de ${totalParcelas}` : 'Zela Edu: assinatura';
}

// Boleto com Pix (o link do Asaas mostra os dois). multa e juros em percentual, como o Asaas espera.
export function montarPagamentoAsaas(c: CobrancaZelaParaAsaas, customerId: string, cfg: MultaJurosZela, totalParcelas: number) {
  const valor = Math.round(toNum(c.valor) * 100) / 100;
  if (!customerId) throw new Error('Cliente do Asaas ausente.');
  if (!(valor > 0)) throw new Error('Cobrança com valor zero não vai para o Asaas.');
  return {
    customer: customerId,
    billingType: 'BOLETO' as const,
    value: valor,
    dueDate: c.vencimento,
    description: descricaoCobranca(c, totalParcelas),
    externalReference: c.id,
    fine: { value: toNum(cfg.multa_percent) },
    interest: { value: toNum(cfg.juros_mensal_percent) },
  };
}

const CICLO_ASAAS: Record<number, 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY'> = {
  1: 'MONTHLY', 2: 'BIMONTHLY', 3: 'QUARTERLY', 6: 'SEMIANNUALLY', 12: 'YEARLY',
};

// Soma meses a uma data ISO (AAAA-MM-DD); dia 29, 30 ou 31 cai no último dia do mês curto.
export function somarMesesISO(dataISO: string, meses: number): string {
  const [y, m, d] = dataISO.split('-').map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

// Assinatura que continua a contratação depois das cobranças iniciais (Mensal: do 2º mês em diante;
// Anual: a renovação). Começa quando o período das parcelas iniciais termina, a partir da 1ª parcela,
// e repete no mesmo intervalo da condição. O valor é o da 1ª parcela sem implantação.
export function planoAssinatura(input: {
  primeiroVencimento: string; parcelas: number; intervaloMeses: number; valorSistema: number | string;
}) {
  const cycle = CICLO_ASAAS[input.intervaloMeses];
  if (!cycle) throw new Error(`Intervalo de ${input.intervaloMeses} mês(es) sem ciclo equivalente no Asaas.`);
  const value = Math.round(toNum(input.valorSistema) * 100) / 100;
  if (!(value > 0)) throw new Error('Assinatura com valor zero não vai para o Asaas.');
  return {
    cycle,
    value,
    nextDueDate: somarMesesISO(input.primeiroVencimento, input.parcelas * input.intervaloMeses),
  };
}

// Status do pagamento no Asaas (consultado direto, nunca o do evento) para o status local.
export function statusLocalDoAsaas(asaasStatus: string | undefined, deleted?: boolean): StatusCobrancaZela | null {
  if (deleted === true || asaasStatus === 'DELETED') return 'cancelada';
  switch (asaasStatus) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'paga';
    case 'OVERDUE':
      return 'vencida';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'estornada';
    case 'PENDING':
      return 'pendente';
    default:
      return null;
  }
}

// Evita que um evento atrasado desfaça um estado mais avançado (ex.: OVERDUE chegando depois de pago).
export function proximoStatus(atual: StatusCobrancaZela, novo: StatusCobrancaZela | null): StatusCobrancaZela | null {
  if (!novo || novo === atual) return null;
  switch (atual) {
    case 'pendente':
      return novo;
    case 'vencida':
      return novo; // paga, cancelada, estornada ou de volta a pendente (novo vencimento)
    case 'paga':
      return novo === 'estornada' ? novo : null;
    case 'cancelada':
    case 'estornada':
      return null;
  }
}

// Comparação em tempo constante do token do webhook.
export function tokenConfere(recebido: string, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = new TextEncoder().encode(recebido);
  const b = new TextEncoder().encode(esperado);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function valorConfere(esperado: number | string, recebido: number | string): boolean {
  return Math.round(toNum(esperado) * 100) === Math.round(toNum(recebido) * 100);
}
