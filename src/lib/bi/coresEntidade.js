// A cor segue a entidade (turma, método, forma de pagamento), não a posição:
// "Maternal I" tem a mesma cor em todos os gráficos e ela não muda quando um
// filtro tira outras turmas. O mapa nasce ordenado por nome e só cresce.
// Os valores reais ficam no @theme (src/index.css): --color-chart-1..5.

export const CORES_CATEGORICAS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

// "Outras" e o que passa do 5º slot: cinza neutro, nunca uma cor nova.
export const COR_OUTRAS = 'var(--color-outline)';

// Escala sequencial de uma cor só (claro para escuro): magnitude e mapa de calor.
export const CORES_SEQUENCIAIS = [
  'var(--color-seq-1)',
  'var(--color-seq-2)',
  'var(--color-seq-3)',
  'var(--color-seq-4)',
  'var(--color-seq-5)',
];

export const COR_POSITIVO = 'var(--color-success)';
export const COR_NEGATIVO = 'var(--color-error)';
export const COR_ZERO = 'var(--color-outline-variant)';

// Mantém os slots já dados em `existente` e dá os próximos livres, em ordem
// alfabética, às entidades novas. Retorna um novo objeto { nome: slot (0 a 4) }.
export function atualizarMapaCores(nomes, existente = {}) {
  const mapa = { ...existente };
  const usados = new Set(Object.values(mapa));
  const novos = [...new Set(nomes)]
    .filter((n) => n && !(n in mapa))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let proximo = 0;
  for (const nome of novos) {
    while (usados.has(proximo)) proximo += 1;
    mapa[nome] = proximo; // 5 ou mais cai em "Outras" em corDaEntidade
    usados.add(proximo);
  }
  return mapa;
}

export function corDaEntidade(mapa, nome) {
  const slot = mapa?.[nome];
  return Number.isInteger(slot) && slot < CORES_CATEGORICAS.length ? CORES_CATEGORICAS[slot] : COR_OUTRAS;
}
