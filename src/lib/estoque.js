// Estoque (módulo `estoque`, PLANO_EXPANSAO_GESTAO.md item 6). Regras puras de
// quantidade e de alerta. O banco é quem barra de verdade (RLS e RPC estoque_registrar).

export const TIPOS_MOVIMENTO = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
};

export const UNIDADES = ['un', 'pct', 'cx', 'kg', 'g', 'l', 'ml', 'm', 'par', 'resma'];

// "1,5" ou "1.5" viram 1.5; vazio ou texto inválido viram null. Até 3 casas.
export function lerQuantidade(texto) {
  const t = String(texto ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,3})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatarQuantidade(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

// Abaixo do mínimo só vale quando a escola definiu um mínimo.
export function abaixoDoMinimo(saldo, minimo) {
  return Number(minimo) > 0 && Number(saldo) < Number(minimo);
}

// Texto da variação mostrada no histórico: +10, -3,5.
export function variacao(mov) {
  const q = Number(mov.quantidade);
  const sinal = mov.tipo === 'saida' ? -1 : 1;
  const v = q * sinal;
  return `${v > 0 ? '+' : ''}${formatarQuantidade(v)}`;
}

export function textoBusca(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Sugestões de categoria (a escola pode digitar qualquer outra). As de material
// pedagógico seguem o método: áreas do Montessori (as mesmas do Mapa de Habilidades)
// e disciplinas do Fundamental I no Tradicional (as mesmas de Matérias).
const CATEGORIAS_GERAIS = ['Papelaria', 'Limpeza', 'Higiene', 'Cozinha', 'Uniforme', 'Manutenção'];
const CATEGORIAS_PEDAGOGICAS = {
  montessori: ['Vida Prática', 'Sensorial', 'Linguagem', 'Matemática', 'Cultura', 'Movimento', 'Convivência e Emoções'],
  tradicional: ['Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia', 'Arte', 'Educação Física', 'Língua Inglesa'],
};

export function categoriasSugeridas(method) {
  const pedagogicas = method === 'personalizado'
    ? [...new Set([...CATEGORIAS_PEDAGOGICAS.montessori, ...CATEGORIAS_PEDAGOGICAS.tradicional])]
    : (CATEGORIAS_PEDAGOGICAS[method] || []);
  return [...pedagogicas, ...CATEGORIAS_GERAIS];
}
