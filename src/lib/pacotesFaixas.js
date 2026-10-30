// Faixas de alunos dos pacotes (menu Planos > Pacotes do Portal do Dev). O preço final de cada
// faixa fica em zela_pacote_faixas; o dev edita só o custo por aluno e o imposto. O resto é conta.
import { arredondar } from './planosZela';

export const IMPOSTO_PADRAO = 15;

// 50; de 60 a 100 de 10 em 10; de 120 a 500 de 20 em 20; de 550 a 1000 de 50 em 50.
export const FAIXAS_PACOTE = [
  ...Array.from({ length: 6 }, (_, i) => 50 + i * 10),
  ...Array.from({ length: 20 }, (_, i) => 120 + i * 20),
  ...Array.from({ length: 10 }, (_, i) => 550 + i * 50),
];

// Custo por aluno do plano: o valor informado, ou a soma do custo estimado do base e dos módulos.
export function custoPorAlunoDoPlano(plano, precos) {
  if (plano?.custo_por_aluno != null && plano.custo_por_aluno !== '') return Number(plano.custo_por_aluno);
  const custo = (id) => Number((precos || []).find(p => p.item_id === id)?.custo_estimado || 0);
  return arredondar(['base', ...(plano?.itens || [])].reduce((s, id) => s + custo(id), 0));
}

// Linha da tabela: tudo que não é preço final nem entrada do dev é calculado aqui.
export function linhaDoPacote(faixa, valorFinal, custoPorAluno, impostoPercent) {
  const final = Number(valorFinal);
  const custo = arredondar(faixa * Number(custoPorAluno || 0));
  const imposto = arredondar(final * Number(impostoPercent || 0) / 100);
  const custoTotal = arredondar(custo + imposto);
  const lucro = arredondar(final - custoTotal);
  return {
    faixa,
    final,
    media: final / faixa,
    custo,
    imposto,
    custoTotal,
    lucro,
    margem: final > 0 ? (lucro / final) * 100 : 0,
  };
}

// Reajuste do custo por aluno por um índice em % (IPCA). Centavos, como a coluna do banco.
export const reajustarCusto = (custo, percent) => arredondar(Number(custo) * (1 + Number(percent) / 100));

// Preço terminado em 9, o mais próximo (299, 349, 1.049).
// O 1e-9 evita o erro de ponto flutuante em empate exato; o servidor (numeric) arredonda meio para cima.
export const arredondarFinal9 = (n) => Math.max(Math.round((Number(n) - 9) / 10 + 1e-9) * 10 + 9, 9);

// Valor final da faixa para o custo atual: o preço de referência escala com o custo, o que mantém a
// margem da faixa. Sem custo de referência (plano sem escada calibrada) o preço fica como está.
export function valorFinalDaFaixa(valorReferencia, custoPorAluno, custoReferencia) {
  const ref = Number(custoReferencia);
  if (!(ref > 0)) return Number(valorReferencia);
  return arredondarFinal9(Number(valorReferencia) * Number(custoPorAluno) / ref);
}

// Mapa faixa -> valor final de um plano, já com o custo atual aplicado. Usado pelo hook e pelas telas
// de venda; null se o plano não tem faixas cadastradas.
export function faixasDoPlano(linhas, plano) {
  const mapa = {};
  const ref = Number(plano.custo_referencia_faixas);
  const custo = plano.custo_por_aluno != null ? Number(plano.custo_por_aluno) : ref;
  for (const l of linhas) if (l.plano_id === plano.id) mapa[l.faixa] = valorFinalDaFaixa(l.valor_final, custo, ref);
  return Object.keys(mapa).length ? mapa : null;
}

export function linhasDoPacote(valoresPorFaixa, custoPorAluno, impostoPercent, custoReferencia = null) {
  return FAIXAS_PACOTE
    .filter(f => valoresPorFaixa[f] != null)
    .map(f => linhaDoPacote(f, valorFinalDaFaixa(valoresPorFaixa[f], custoPorAluno, custoReferencia), custoPorAluno, impostoPercent));
}
