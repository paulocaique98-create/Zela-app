// Regras de preço dos planos do Zela (menu Planos do Portal do Dev). A RPC
// contratar_plano_escola recalcula tudo no servidor com a mesma regra; o que
// vem daqui é só prévia. Valores em reais, sempre arredondados em centavos.
import { ITEM_POR_ID } from './modulosCatalogo';

export const CICLOS = [
  { id: 'MENSAL', label: 'Mensal', meses: 1 },
  { id: 'SEMESTRAL', label: 'Semestral', meses: 6 },
  { id: 'ANUAL', label: 'Anual', meses: 12 },
  { id: 'BIANUAL', label: 'Bianual', meses: 24 },
];
export const CICLO_POR_ID = Object.fromEntries(CICLOS.map(c => [c.id, c]));

export const CONFIG_PADRAO = {
  limite_alunos_por_aluno: 50,
  desconto_implantacao_max_percent: 50,
  implantacao_min: 600,
  implantacao_max: 1200,
};

export const arredondar = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// precos: lista de linhas de zela_modulo_precos ({ item_id, tipo_cobranca, valor, ativo }).
const porId = (precos) => Object.fromEntries((precos || []).map(p => [p.item_id, p]));

// Itens vendáveis (nunca técnicos nem o base), sem repetir, respeitando "requer".
export function itensValidos(itens) {
  const vistos = new Set();
  const ok = [];
  for (const id of itens || []) {
    const item = ITEM_POR_ID[id];
    if (!item || item.fixo || item.grupo === 'tecnico' || vistos.has(id)) continue;
    vistos.add(id);
    ok.push(id);
  }
  return ok.filter(id => {
    const req = ITEM_POR_ID[id].requer;
    return !req || vistos.has(req);
  });
}

// Soma dos preços por aluno do base + itens escolhidos.
export function valorPorAluno(itens, precos) {
  const map = porId(precos);
  const ids = ['base', ...(itens || []).filter(i => i !== 'base')];
  return arredondar(ids.reduce((s, id) => {
    const p = map[id];
    return s + (p && p.tipo_cobranca === 'por_aluno' ? Number(p.valor) : 0);
  }, 0));
}

// Itens de cobrança fixa mensal (ex.: app com a marca).
export function valorFixoMensal(itens, precos) {
  const map = porId(precos);
  return arredondar((itens || []).reduce((s, id) => {
    const p = map[id];
    return s + (p && p.tipo_cobranca === 'fixo_mensal' ? Number(p.valor) : 0);
  }, 0));
}

// R2, R3: maior valor entre alunos x preço e o mínimo mensal, mais os fixos.
// Pacote usa o preço por aluno do plano; por aluno soma os avulsos.
export function mensalidade(plano, alunos, precos, itensEscolhidos) {
  const itens = plano.modalidade === 'pacote' ? (plano.itens || []) : (itensEscolhidos || []);
  const precoAluno = plano.modalidade === 'pacote' ? Number(plano.preco_por_aluno) : valorPorAluno(itens, precos);
  const base = Math.max(Number(alunos || 0) * precoAluno, Number(plano.minimo_mensal || 0));
  return arredondar(base + valorFixoMensal(itens, precos));
}

// R4: valor do ciclo com o desconto do ciclo.
export function valorDoCiclo(mensal, ciclo) {
  const meses = ciclo.meses ?? CICLO_POR_ID[ciclo.ciclo]?.meses ?? 1;
  return arredondar(Number(mensal) * meses * (1 - Number(ciclo.desconto_percent || 0) / 100));
}

export function implantacaoBase(plano, ciclo) {
  return Number(ciclo?.implantacao_valor ?? plano.implantacao_valor ?? 0);
}

// R6: desconto em % ou R$, nunca negativo. Retorna { desconto, final, erro }.
export function implantacaoFinal(base, tipo, desconto, tetoPercent = CONFIG_PADRAO.desconto_implantacao_max_percent) {
  const b = Number(base || 0);
  const d = Number(desconto || 0);
  if (!d) return { desconto: 0, final: arredondar(b), erro: null };
  if (d < 0) return { desconto: 0, final: arredondar(b), erro: 'Desconto inválido.' };
  const pct = tipo === 'percent' ? d : (b > 0 ? (d * 100) / b : 100);
  if (pct > tetoPercent) {
    return { desconto: 0, final: arredondar(b), erro: `O desconto máximo na implantação é de ${tetoPercent} por cento.` };
  }
  const valor = Math.min(tipo === 'percent' ? arredondar(b * d / 100) : arredondar(d), b);
  return { desconto: valor, final: arredondar(Math.max(b - valor, 0)), erro: null };
}

// R1: modalidades que a escola pode contratar. Até o limite (inclusive) escolhe
// entre por aluno e pacote; acima, só pacote.
export function modalidadesPermitidas(alunos, limite = CONFIG_PADRAO.limite_alunos_por_aluno) {
  return Number(alunos) <= limite ? ['por_aluno', 'pacote'] : ['pacote'];
}

// R10: escola com contratação por aluno que passou do limite.
export function passouDoLimite(contratacao, alunosAtivos, limite = CONFIG_PADRAO.limite_alunos_por_aluno) {
  return contratacao?.modalidade === 'por_aluno' && Number(alunosAtivos) > limite;
}

// Preço sugerido de um pacote: soma dos avulsos e o desconto implícito.
export function sugestaoDePacote(itens, precoPorAluno, precos) {
  const soma = valorPorAluno(itens, precos);
  const desconto = soma > 0 ? arredondar((1 - Number(precoPorAluno) / soma) * 100) : 0;
  return { soma, desconto };
}

// Vencimento: dias até o fim da contratação (negativo = vencida).
export function diasParaVencer(fim, hoje = new Date()) {
  if (!fim) return null;
  const [a, m, d] = String(fim).slice(0, 10).split('-').map(Number);
  const alvo = Date.UTC(a, m - 1, d);
  const ref = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - ref) / 86400000);
}

export function formatarData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
