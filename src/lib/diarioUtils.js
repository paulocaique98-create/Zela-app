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
// Desjejum/Lanche (sem a pergunta "comeu tudo") usam "Comeu X." numa linha só;
// Almoço/Jantar usam "Serviu-se com X." e quebram cada frase (itens/comeu
// tudo/repetiu) em uma linha própria, mais fácil de ler. As observações
// entram DENTRO da frase, antes do ponto final — "Não comeu tudo o que
// serviu (X)." não "...serviu. (X)".
export function formatRefeicaoTexto(r) {
  if (!r) return '';
  const itens = (r.itens_servidos || []).map(normalizeItemServido);
  const itensText = joinWithE(itens.map(i => (i.quantidade ? `${i.nome} (${i.quantidade})` : i.nome)));
  const principal = mealAsksComeuTudo(r.refeicao);
  const verbo = principal ? 'Serviu-se com' : 'Comeu';
  const linhas = [itensText ? `${verbo} ${itensText}.` : 'Sem lançamento de itens.'];
  if (r.comeu_tudo === true) linhas.push('Comeu tudo o que serviu.');
  else if (r.comeu_tudo === false) {
    linhas.push(r.observacao_recusa ? `Não comeu tudo o que serviu (${r.observacao_recusa}).` : 'Não comeu tudo o que serviu.');
  }
  if (r.repetiu) {
    linhas.push(r.observacao_repeticao ? `Repetiu ${r.vezes_repetiu || 1}x (${r.observacao_repeticao}).` : `Repetiu ${r.vezes_repetiu || 1}x.`);
  }
  return principal ? linhas.join('\n') : linhas.join(' ');
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
