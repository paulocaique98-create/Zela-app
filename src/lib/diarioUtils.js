// Helpers compartilhados entre AdminDiario.jsx (lançamento) e FamilyDiario.jsx
// (consulta) — mesma lógica de texto/parsing dos dois lados, pra não divergir.

// cardapio_itens.descricao é um texto livre por refeição (ex: "Arroz, feijão
// e repolho", "Maçã + Pãozinho caseiro com pastinha de grão de bico", ou
// "Arroz branco / Feijão") — não uma lista estruturada. Separa em itens
// individuais pra virar chips selecionáveis no lançamento. Aceita vírgula,
// "+", "/" e "e" como separadores.
export function splitCardapioItens(descricao) {
  if (!descricao) return [];
  const parts = descricao
    .split(/,|\+|\//)
    .flatMap(s => s.split(/\s+e\s+/i))
    .map(s => s.trim())
    .filter(Boolean);
  return parts;
}

export function joinWithE(items) {
  if (!items || items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

// Refeições "principais" pedem a pergunta binária "Comeu tudo que serviu?".
// Refeições mais leves (desjejum/lanche) pedem só quantidade por item — não
// faz sentido perguntar "comeu tudo" de uma fruta e um pão.
export const REFEICOES_PRINCIPAIS = ['Almoço', 'Jantar'];
export function mealAsksComeuTudo(refeicao) {
  return REFEICOES_PRINCIPAIS.includes(refeicao);
}

// Normaliza um item servido pro formato atual { nome, quantidade } — aceita
// também o formato antigo (string simples) de lançamentos salvos antes dessa
// mudança, sem precisar migrar dados históricos.
export function normalizeItemServido(item) {
  if (typeof item === 'string') return { nome: item, quantidade: '' };
  return { nome: item?.nome || '', quantidade: item?.quantidade || '' };
}

// Gera o texto exibido pra família a partir de um item do jsonb `refeicoes`.
export function formatRefeicaoTexto(r) {
  if (!r) return '';
  const itens = (r.itens_servidos || []).map(normalizeItemServido);
  const itensText = joinWithE(itens.map(i => (i.quantidade ? `${i.nome} (${i.quantidade})` : i.nome)));
  let texto = itensText ? `Serviu-se com ${itensText}.` : 'Sem lançamento de itens.';
  if (r.comeu_tudo === true) texto += ' Comeu tudo o que serviu.';
  else if (r.comeu_tudo === false) {
    texto += ' Não comeu tudo o que serviu.';
    if (r.observacao_recusa) texto += ` (${r.observacao_recusa})`;
  }
  if (r.repetiu) {
    texto += ` Repetiu ${r.vezes_repetiu || 1}x.`;
    if (r.observacao_repeticao) texto += ` (${r.observacao_repeticao})`;
  }
  return texto;
}

export function formatSonoTexto(sonoInicio, sonoFim) {
  if (!sonoInicio || !sonoFim) return null;
  return `Dormiu de ${sonoInicio.slice(0, 5)} a ${sonoFim.slice(0, 5)}`;
}

export function formatEvacuacaoTexto(evacuou, aparencia) {
  if (evacuou === true) return aparencia ? `Evacuou. Aparência: ${aparencia}` : 'Evacuou.';
  if (evacuou === false) return 'Não evacuou.';
  return null;
}
