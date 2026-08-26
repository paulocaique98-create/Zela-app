// Helpers compartilhados entre AdminDiario.jsx (lançamento) e FamilyDiario.jsx
// (consulta) — mesma lógica de texto/parsing dos dois lados, pra não divergir.

// cardapio_itens.descricao é um texto livre por refeição (ex: "Arroz, feijão
// e repolho") — não uma lista estruturada. Separa em itens individuais pra
// virar chips selecionáveis no lançamento.
export function splitCardapioItens(descricao) {
  if (!descricao) return [];
  const parts = descricao.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  const last = parts[parts.length - 1];
  const eSplit = last.split(/\s+e\s+/i).map(s => s.trim()).filter(Boolean);
  if (eSplit.length > 1) {
    parts.splice(parts.length - 1, 1, ...eSplit);
  }
  return parts;
}

export function joinWithE(items) {
  if (!items || items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

// Gera o texto exibido pra família a partir de um item do jsonb `refeicoes`.
export function formatRefeicaoTexto(r) {
  if (!r) return '';
  const itensText = joinWithE(r.itens_servidos || []);
  let texto = itensText ? `Serviu-se com ${itensText}.` : 'Sem lançamento de itens.';
  if (r.comeu_tudo === true) texto += ' Comeu tudo o que serviu.';
  else if (r.comeu_tudo === false) texto += ' Não comeu tudo o que serviu.';
  if (r.repetiu) texto += ` Repetiu ${r.vezes_repetiu || 1}x.`;
  return texto;
}

export function formatSonoTexto(sonoInicio, sonoFim) {
  if (!sonoInicio || !sonoFim) return null;
  return `Dormiu de ${sonoInicio.slice(0, 5)} a ${sonoFim.slice(0, 5)}`;
}

export function formatEvacuacaoTexto(evacuou) {
  if (evacuou === true) return 'Evacuou.';
  if (evacuou === false) return 'Não evacuou.';
  return null;
}
