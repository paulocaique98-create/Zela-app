import { describe, it, expect } from 'vitest';
import {
  addMeses, diasNoPeriodo, resolverPeriodo, periodoAnterior,
  mesmoPeriodoAnoPassado, periodoDeComparacao, validarPeriodo,
} from './periodos';

const HOJE = '2026-10-28';

describe('resolverPeriodo', () => {
  it('este mês vai do dia 1 até hoje', () => {
    expect(resolverPeriodo('este-mes', { hoje: HOJE })).toEqual({ inicio: '2026-10-01', fim: HOJE });
  });
  it('mês passado cobre o mês inteiro', () => {
    expect(resolverPeriodo('mes-passado', { hoje: HOJE })).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' });
  });
  it('mês passado em janeiro volta para dezembro do ano anterior', () => {
    expect(resolverPeriodo('mes-passado', { hoje: '2026-01-15' })).toEqual({ inicio: '2025-12-01', fim: '2025-12-31' });
  });
  it('últimos 3 meses inclui o mês atual e os dois anteriores', () => {
    expect(resolverPeriodo('ultimos-3-meses', { hoje: HOJE })).toEqual({ inicio: '2026-08-01', fim: HOJE });
  });
  it('últimos 12 meses começa 11 meses antes do mês atual', () => {
    expect(resolverPeriodo('ultimos-12-meses', { hoje: HOJE })).toEqual({ inicio: '2025-11-01', fim: HOJE });
  });
  it('ano letivo usa as datas do ano aberto e corta em hoje', () => {
    const anoLetivo = { start_date: '2026-02-02', end_date: '2026-12-18' };
    expect(resolverPeriodo('ano-letivo', { hoje: HOJE, anoLetivo })).toEqual({ inicio: '2026-02-02', fim: HOJE });
  });
  it('ano letivo já encerrado usa o fim dele', () => {
    const anoLetivo = { start_date: '2025-02-03', end_date: '2025-12-19' };
    expect(resolverPeriodo('ano-letivo', { hoje: HOJE, anoLetivo }).fim).toBe('2025-12-19');
  });
  it('ano letivo sem cadastro cai no ano civil', () => {
    expect(resolverPeriodo('ano-letivo', { hoje: HOJE })).toEqual({ inicio: '2026-01-01', fim: HOJE });
  });
  it('personalizado devolve as datas informadas', () => {
    expect(resolverPeriodo('personalizado', { hoje: HOJE, personalizado: { inicio: '2026-03-01', fim: '2026-03-31' } }))
      .toEqual({ inicio: '2026-03-01', fim: '2026-03-31' });
  });
});

describe('addMeses', () => {
  it('prende no último dia do mês de destino', () => {
    expect(addMeses('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMeses('2024-02-29', -12)).toBe('2023-02-28');
  });
  it('rejeita data inexistente', () => {
    expect(addMeses('2026-02-31', 1)).toBeNull();
  });
});

describe('comparações', () => {
  it('período anterior tem o mesmo tamanho e termina na véspera', () => {
    const p = { inicio: '2026-10-01', fim: '2026-10-28' };
    const ant = periodoAnterior(p);
    expect(ant).toEqual({ inicio: '2026-09-03', fim: '2026-09-30' });
    expect(diasNoPeriodo(ant.inicio, ant.fim)).toBe(diasNoPeriodo(p.inicio, p.fim));
  });
  it('mesmo período do ano passado desloca 12 meses', () => {
    expect(mesmoPeriodoAnoPassado({ inicio: '2026-10-01', fim: '2026-10-28' })).toEqual({ inicio: '2025-10-01', fim: '2025-10-28' });
  });
  it('periodoDeComparacao respeita a opção escolhida', () => {
    const p = { inicio: '2026-10-01', fim: '2026-10-28' };
    expect(periodoDeComparacao(p, 'nenhuma')).toBeNull();
    expect(periodoDeComparacao(p, 'anterior')).not.toBeNull();
    expect(periodoDeComparacao(p, 'ano-passado').inicio).toBe('2025-10-01');
  });
});

describe('validarPeriodo', () => {
  it('aceita período normal', () => {
    expect(validarPeriodo({ inicio: '2026-01-01', fim: '2026-10-28' })).toBeNull();
  });
  it('exige as duas datas válidas', () => {
    expect(validarPeriodo({ inicio: '', fim: '2026-10-28' })).toMatch(/duas datas/);
  });
  it('barra data final antes da inicial', () => {
    expect(validarPeriodo({ inicio: '2026-10-28', fim: '2026-10-01' })).toMatch(/não pode/);
  });
  it('barra mais de 24 meses', () => {
    expect(validarPeriodo({ inicio: '2024-01-01', fim: '2026-10-28' })).toMatch(/24 meses/);
    expect(validarPeriodo({ inicio: '2024-10-28', fim: '2026-10-28' })).toBeNull();
  });
});
