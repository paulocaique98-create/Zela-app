// Regras do acordo de dívida (item 10 do plano de expansão da Gestão).
// Espelho de src/lib/acordoDivida.js: o servidor é quem decide, o front só simula.
export const MAX_PARCELAS = 24;
export const PARCELA_MINIMA_CENTS = 500;
export const DIAS_PARA_ROMPER = 30;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function somarMeses(dataISO: string, meses: number): string {
  const [a, m, d] = dataISO.split('-').map(Number);
  const total = (m - 1) + meses;
  const ano = a + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return `${String(ano).padStart(4, '0')}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function diasDeAtraso(dueDate: string, hoje: string): number {
  return Math.floor((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000);
}

export function calcularAcordo(entrada: {
  valorOriginalCents: number; descontoCents: number; parcelas: number; primeiroVencimento: string; hoje: string;
}) {
  const { valorOriginalCents, descontoCents, parcelas, primeiroVencimento, hoje } = entrada;
  if (!Number.isInteger(valorOriginalCents) || valorOriginalCents <= 0) throw new Error('Selecione ao menos uma cobrança atrasada.');
  if (!Number.isInteger(descontoCents) || descontoCents < 0) throw new Error('O desconto não pode ser negativo.');
  if (descontoCents >= valorOriginalCents) throw new Error('O desconto precisa ser menor que o valor original.');
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) throw new Error(`Use de 1 a ${MAX_PARCELAS} parcelas.`);
  if (!DATA.test(String(primeiroVencimento || ''))) throw new Error('Informe o primeiro vencimento.');
  if (primeiroVencimento < hoje) throw new Error('O primeiro vencimento não pode ser no passado.');

  const valorAcordadoCents = valorOriginalCents - descontoCents;
  const base = Math.floor(valorAcordadoCents / parcelas);
  if (base < PARCELA_MINIMA_CENTS) throw new Error('Cada parcela precisa ter ao menos R$ 5,00. Reduza o número de parcelas.');
  const sobra = valorAcordadoCents - base * parcelas;
  const lista = Array.from({ length: parcelas }, (_, i) => ({
    numero: i + 1,
    amountCents: base + (i === 0 ? sobra : 0),
    dueDate: somarMeses(primeiroVencimento, i),
  }));
  return { valorAcordadoCents, parcelas: lista };
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

// Texto padrão do termo. Se a escola tiver um modelo chamado "Acordo de dívida", o corpo dele
// substitui este, com as mesmas variáveis {{...}}.
export const TERMO_PADRAO = `TERMO DE ACORDO DE PARCELAMENTO DE DÉBITO

CONTRATANTE (escola): {{escola_nome}}
RESPONSÁVEL FINANCEIRO: {{responsavel_nome}}
ALUNO: {{aluno_nome}}

CLÁUSULA 1 · DO DÉBITO
O responsável reconhece o débito em aberto no valor de {{valor_original}}, referente às cobranças vencidas: {{cobrancas}}.

CLÁUSULA 2 · DO ACORDO
A escola concede desconto de {{desconto}}, e o valor acordado fica em {{valor_acordado}}, pago em {{parcelas}} parcela(s), conforme o quadro abaixo:
{{quadro_parcelas}}

CLÁUSULA 3 · DA SUBSTITUIÇÃO DAS COBRANÇAS
Com a assinatura deste termo, as cobranças originais são canceladas e substituídas pelas parcelas acima, que serão enviadas pelo aplicativo Zela Edu.

CLÁUSULA 4 · DO DESCUMPRIMENTO
Se qualquer parcela ficar ${DIAS_PARA_ROMPER} dias ou mais em atraso, o acordo se rompe, o desconto deixa de valer e as cobranças originais voltam a ser exigíveis, abatidos os valores já pagos.

CLÁUSULA 5 · DA ASSINATURA
As partes reconhecem a validade da assinatura eletrônica realizada pelo aplicativo Zela Edu, nos termos da Lei 14.063/2020.`;

export function preencherTermo(corpo: string, valores: Record<string, string>): string {
  return corpo.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, chave) => valores[chave] ?? '');
}
