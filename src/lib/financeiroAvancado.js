// Cálculos puros das telas DRE e Fluxo de caixa (RPCs fin_dre e fin_fluxo_projetado).
// Fora do DRE por falta de dado: taxas do gateway, descontos e bolsas, tipo da cobrança.

export const GRUPOS_DRE = [
  { id: 'pessoal', nome: 'Pessoal' },
  { id: 'ocupacao', nome: 'Ocupação' },
  { id: 'material', nome: 'Material' },
  { id: 'administrativo', nome: 'Administrativo' },
  { id: 'impostos', nome: 'Impostos' },
  { id: 'financeiro', nome: 'Financeiro' },
  { id: 'outros', nome: 'Outros' },
];

// Lista os meses (YYYY-MM) entre duas datas ISO, inclusive.
export function mesesDoPeriodo(inicio, fim) {
  const meses = [];
  let [a, m] = inicio.slice(0, 7).split('-').map(Number);
  const [fa, fm] = fim.slice(0, 7).split('-').map(Number);
  while (a < fa || (a === fa && m <= fm)) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return meses;
}

// Transforma a resposta de fin_dre em linhas em cascata: receita, despesas por grupo,
// total de despesas e resultado. Cada linha traz um valor por mês e o total.
export function montarDre(raw, inicio, fim) {
  const meses = mesesDoPeriodo(inicio, fim);
  const soma = (porMes) => meses.reduce((s, m) => s + (porMes[m] || 0), 0);
  const receita = Object.fromEntries(meses.map(m => [m, raw?.receita_por_mes?.[m] || 0]));

  const porGrupo = {};
  for (const l of raw?.despesa_por_grupo_mes || []) {
    porGrupo[l.grupo] = porGrupo[l.grupo] || {};
    porGrupo[l.grupo][l.mes] = (porGrupo[l.grupo][l.mes] || 0) + l.cents;
  }
  const grupos = GRUPOS_DRE.filter(g => porGrupo[g.id]).map(g => ({
    id: g.id, nome: g.nome, porMes: porGrupo[g.id], total: soma(porGrupo[g.id]),
  }));

  const despesaMes = Object.fromEntries(meses.map(m => [m, grupos.reduce((s, g) => s + (g.porMes[m] || 0), 0)]));
  const resultadoMes = Object.fromEntries(meses.map(m => [m, receita[m] - despesaMes[m]]));

  return {
    meses,
    receita: { porMes: receita, total: soma(receita) },
    grupos,
    despesas: { porMes: despesaMes, total: soma(despesaMes) },
    resultado: { porMes: resultadoMes, total: soma(resultadoMes) },
  };
}

// Saldo semana a semana. Entradas em aberto são multiplicadas pela taxa histórica de
// recebimento (média no esperado, máxima no otimista, mínima no pessimista). Sem
// histórico, a taxa vale 1 e `semHistorico` avisa a tela.
export function montarFluxo(raw) {
  const saldoInicial = raw?.saldo_inicial_cents ?? null;
  const semHistorico = raw?.taxa_media == null;
  const taxa = (v) => (v == null ? 1 : Math.min(1, Math.max(0, Number(v))));
  const t = { esperado: taxa(raw?.taxa_media), otimista: taxa(raw?.taxa_max), pessimista: taxa(raw?.taxa_min) };

  let esperado = saldoInicial ?? 0;
  let otimista = esperado;
  let pessimista = esperado;
  const semanas = (raw?.semanas || []).map(s => {
    esperado += Math.round(s.entradas_cents * t.esperado) - s.saidas_cents;
    otimista += Math.round(s.entradas_cents * t.otimista) - s.saidas_cents;
    pessimista += Math.round(s.entradas_cents * t.pessimista) - s.saidas_cents;
    return {
      semana: s.semana, entradas_cents: s.entradas_cents, saidas_cents: s.saidas_cents,
      esperado, otimista, pessimista,
    };
  });
  return {
    saldoInicial, semHistorico, semanas,
    saldoNegativo: semanas.some(s => s.esperado < 0),
    primeiraSemanaNegativa: semanas.find(s => s.esperado < 0)?.semana || null,
  };
}
