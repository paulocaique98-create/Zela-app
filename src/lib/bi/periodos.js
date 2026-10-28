// Períodos do painel de indicadores. Todas as datas são strings AAAA-MM-DD
// (data de negócio, sem hora), calculadas em UTC para não deslizar um dia
// com o fuso. "Hoje" vem de fora (padrão: todayISO, fuso de São Paulo).
import { todayISO } from '../gestaoUtils';

export const PERIODO_MAX_MESES = 24;

export const PRESETS_PERIODO = [
  { id: 'este-mes', label: 'Este mês' },
  { id: 'mes-passado', label: 'Mês passado' },
  { id: 'ultimos-3-meses', label: 'Últimos 3 meses' },
  { id: 'ano-letivo', label: 'Ano letivo atual' },
  { id: 'ultimos-12-meses', label: 'Últimos 12 meses' },
  { id: 'personalizado', label: 'Personalizado' },
];

export const COMPARACOES = [
  { id: 'nenhuma', label: 'Nenhuma' },
  { id: 'anterior', label: 'Período anterior' },
  { id: 'ano-passado', label: 'Mesmo período do ano passado' },
];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(iso) {
  const m = ISO.exec(iso || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Rejeita 2026-02-31 (o Date normalizaria para março).
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

export function addDias(iso, dias) {
  const d = parse(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + dias);
  return fmt(d);
}

// Soma meses mantendo o dia; se o mês de destino é mais curto (31 → 30, 29/02 → 28/02), fica no último dia.
export function addMeses(iso, meses) {
  const d = parse(iso);
  if (!d) return null;
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return fmt(d);
}

function primeiroDiaDoMes(iso) {
  return `${iso.slice(0, 7)}-01`;
}

function ultimoDiaDoMes(iso) {
  return addDias(addMeses(primeiroDiaDoMes(iso), 1), -1);
}

export function diasNoPeriodo(inicio, fim) {
  const a = parse(inicio);
  const b = parse(fim);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

// anoLetivo: { start_date, end_date } de school_years aberto (opcional).
// Sem ano letivo cadastrado, cai no ano civil.
export function resolverPeriodo(preset, { hoje = todayISO(), anoLetivo = null, personalizado = null } = {}) {
  switch (preset) {
    case 'este-mes':
      return { inicio: primeiroDiaDoMes(hoje), fim: hoje };
    case 'mes-passado': {
      const ini = addMeses(primeiroDiaDoMes(hoje), -1);
      return { inicio: ini, fim: ultimoDiaDoMes(ini) };
    }
    case 'ultimos-3-meses':
      return { inicio: addMeses(primeiroDiaDoMes(hoje), -2), fim: hoje };
    case 'ano-letivo': {
      if (anoLetivo?.start_date && anoLetivo?.end_date) {
        return { inicio: anoLetivo.start_date, fim: anoLetivo.end_date < hoje ? anoLetivo.end_date : hoje };
      }
      return { inicio: `${hoje.slice(0, 4)}-01-01`, fim: hoje };
    }
    case 'ultimos-12-meses':
      return { inicio: addMeses(primeiroDiaDoMes(hoje), -11), fim: hoje };
    case 'personalizado':
      return personalizado ? { inicio: personalizado.inicio, fim: personalizado.fim } : { inicio: primeiroDiaDoMes(hoje), fim: hoje };
    default:
      return { inicio: primeiroDiaDoMes(hoje), fim: hoje };
  }
}

// Mesmo número de dias, imediatamente antes do período.
export function periodoAnterior({ inicio, fim }) {
  const n = diasNoPeriodo(inicio, fim);
  if (!n) return null;
  return { inicio: addDias(inicio, -n), fim: addDias(inicio, -1) };
}

export function mesmoPeriodoAnoPassado({ inicio, fim }) {
  const a = addMeses(inicio, -12);
  const b = addMeses(fim, -12);
  return a && b ? { inicio: a, fim: b } : null;
}

export function periodoDeComparacao(periodo, comparacao) {
  if (comparacao === 'anterior') return periodoAnterior(periodo);
  if (comparacao === 'ano-passado') return mesmoPeriodoAnoPassado(periodo);
  return null;
}

// Retorna mensagem de erro em português ou null se o período é válido.
export function validarPeriodo({ inicio, fim }) {
  if (!parse(inicio) || !parse(fim)) return 'Informe as duas datas.';
  if (fim < inicio) return 'A data final não pode ser antes da inicial.';
  if (fim > addMeses(inicio, PERIODO_MAX_MESES)) return `O período máximo é de ${PERIODO_MAX_MESES} meses.`;
  return null;
}
