// Cálculo do acordo de dívida (item 10 do plano de expansão da Gestão).
// O servidor repete estas regras em supabase/functions/_shared/debtAgreement.ts
// e é quem decide; aqui só alimenta o simulador da tela.
export const MAX_PARCELAS = 24;
export const PARCELA_MINIMA_CENTS = 500;
export const DIAS_PARA_ROMPER = 30;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Soma meses mantendo o dia; em mês mais curto cai no último dia (31/01 + 1 mês = 28/02).
export function somarMeses(dataISO, meses) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const total = (m - 1) + meses;
  const ano = a + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return `${String(ano).padStart(4, '0')}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Divide o valor acordado em parcelas inteiras em centavos; a sobra vai para a primeira.
export function calcularAcordo({ valorOriginalCents, descontoCents = 0, parcelas, primeiroVencimento, hoje }) {
  if (!Number.isInteger(valorOriginalCents) || valorOriginalCents <= 0) return { erro: 'Selecione ao menos uma cobrança atrasada.' };
  if (!Number.isInteger(descontoCents) || descontoCents < 0) return { erro: 'O desconto não pode ser negativo.' };
  if (descontoCents >= valorOriginalCents) return { erro: 'O desconto precisa ser menor que o valor original.' };
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) return { erro: `Use de 1 a ${MAX_PARCELAS} parcelas.` };
  if (!DATA.test(String(primeiroVencimento || ''))) return { erro: 'Informe o primeiro vencimento.' };
  if (hoje && primeiroVencimento < hoje) return { erro: 'O primeiro vencimento não pode ser no passado.' };

  const valorAcordadoCents = valorOriginalCents - descontoCents;
  const base = Math.floor(valorAcordadoCents / parcelas);
  if (base < PARCELA_MINIMA_CENTS) return { erro: 'Cada parcela precisa ter ao menos R$ 5,00. Reduza o número de parcelas.' };
  const sobra = valorAcordadoCents - base * parcelas;
  const lista = Array.from({ length: parcelas }, (_, i) => ({
    numero: i + 1,
    amountCents: base + (i === 0 ? sobra : 0),
    dueDate: somarMeses(primeiroVencimento, i),
  }));
  return { valorAcordadoCents, parcelas: lista };
}

export function diasDeAtraso(dueDate, hoje) {
  return Math.floor((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000);
}

// Regra D8: o acordo rompe quando uma parcela passa de 30 dias de atraso.
export function podeRomperAcordo(parcelas, hoje) {
  return parcelas.some(p => p.status === 'OVERDUE' && diasDeAtraso(p.dueDate, hoje) >= DIAS_PARA_ROMPER);
}

export const STATUS_ACORDO = {
  rascunho: 'Rascunho', aguardando_assinatura: 'Aguardando assinatura', ativo: 'Ativo',
  quitado: 'Quitado', rompido: 'Rompido', cancelado: 'Cancelado',
};
