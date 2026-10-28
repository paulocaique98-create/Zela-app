// Formatação dos números do painel. Texto voltado ao usuário sem hífen.
import { centsToBRL } from '../gestaoUtils';

const nf = (casas) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });

export function formatarNumero(valor, casas = 0) {
  return Number.isFinite(Number(valor)) && valor !== null && valor !== '' ? nf(casas).format(Number(valor)) : '·';
}

// valor já em pontos percentuais (12.5 vira "12,5%").
export function formatarPercentual(valor, casas = 1) {
  return Number.isFinite(Number(valor)) && valor !== null && valor !== '' ? `${nf(casas).format(Number(valor))}%` : '·';
}

// Valor financeiro. null significa "o banco não enviou" (perfil sem acesso a R$).
export function formatarMoeda(centavos) {
  return centavos === null || centavos === undefined ? '·' : centsToBRL(centavos);
}

// Variação entre o período atual e o de comparação.
// maisEhMelhor=false para indicadores como inadimplência e faltas.
// tom: 'good' | 'bad' | 'neutral'; direcao: 'up' | 'down' | 'flat'.
// Retorna null quando não há base de comparação (anterior vazio ou zero).
export function calcularVariacao(atual, anterior, { maisEhMelhor = true } = {}) {
  const a = Number(atual);
  const b = Number(anterior);
  if (atual === null || atual === undefined || anterior === null || anterior === undefined) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const pct = ((a - b) / Math.abs(b)) * 100;
  if (Math.abs(pct) < 0.05) return { pct: 0, direcao: 'flat', tom: 'neutral', texto: 'Sem variação' };
  const direcao = pct > 0 ? 'up' : 'down';
  const bom = (pct > 0) === maisEhMelhor;
  return {
    pct,
    direcao,
    tom: bom ? 'good' : 'bad',
    texto: `${nf(1).format(Math.abs(pct))}% ${pct > 0 ? 'acima' : 'abaixo'}`,
  };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// '2026-09-01' vira 'set/26'. Sem conversão de fuso: lê só o texto da data.
export function rotuloMes(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || '');
  return m ? `${MESES[+m[2] - 1]}/${m[1].slice(2)}` : '·';
}
