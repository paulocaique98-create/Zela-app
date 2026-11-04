// Configurações do faturamento (PLANO_FATURAMENTO_ZELA.md, 7A): rótulos e diff do histórico.
// O histórico vem de zela_planos_historico (gatilho zela_registrar_historico), só developer lê.

export const CAMPOS_CONFIG = {
  vencimento_primeira_dias: { rotulo: 'Vencimento da 1ª parcela (dias)', tipo: 'dias' },
  carencia_dias: { rotulo: 'Carência até o bloqueio (dias)', tipo: 'dias' },
  cancelar_1a_parcela_dias: { rotulo: 'Sugerir cancelar 1ª parcela não paga após (dias)', tipo: 'dias' },
  multa_percent: { rotulo: 'Multa por atraso', tipo: 'percent' },
  juros_mensal_percent: { rotulo: 'Juros ao mês', tipo: 'percent' },
  desconto_mensalidade_opcoes: { rotulo: 'Descontos da mensalidade', tipo: 'lista' },
  desconto_implantacao_max_percent: { rotulo: 'Teto de desconto da implantação', tipo: 'percent' },
  implantacao_min: { rotulo: 'Implantação mínima', tipo: 'brl' },
  implantacao_max: { rotulo: 'Implantação máxima', tipo: 'brl' },
};

const CAMPOS_CONDICAO = {
  desconto_percent: { rotulo: 'Desconto', tipo: 'percent' },
  ativo: { rotulo: 'Condição ativa', tipo: 'bool' },
};

const NOME_CONDICAO = {
  mensal: 'Mensal',
  anual_vista: 'Anual à vista',
  anual_6x: 'Anual em 6x',
  anual_12x: 'Anual em 12x',
};

export function formatarValor(tipo, v) {
  if (v === null || v === undefined) return 'vazio';
  if (tipo === 'bool') return v ? 'Sim' : 'Não';
  if (tipo === 'percent') return `${String(Number(v)).replace('.', ',')}%`;
  if (tipo === 'brl') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (tipo === 'lista') return (Array.isArray(v) ? v : []).map(n => `${String(Number(n)).replace('.', ',')}%`).join(', ') || 'nenhum';
  if (tipo === 'dias') return `${Number(v)} ${Number(v) === 1 ? 'dia' : 'dias'}`;
  return String(v);
}

function igual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// Uma linha do histórico vira uma lista de mudanças campo a campo (só o que mudou).
export function mudancasDoRegistro(reg) {
  const depois = reg?.depois || {};
  const antes = reg?.antes || null;
  const ehCondicao = reg?.tabela === 'zela_condicoes_pagamento';
  const campos = ehCondicao ? CAMPOS_CONDICAO : CAMPOS_CONFIG;
  const origem = ehCondicao ? (NOME_CONDICAO[depois.chave] || depois.chave || 'Condição') : 'Configuração';
  const out = [];
  for (const [k, def] of Object.entries(campos)) {
    if (!(k in depois)) continue;
    if (antes && igual(antes[k], depois[k])) continue;
    out.push({
      origem,
      campo: def.rotulo,
      antes: antes ? formatarValor(def.tipo, antes[k]) : null,
      depois: formatarValor(def.tipo, depois[k]),
    });
  }
  return out;
}
