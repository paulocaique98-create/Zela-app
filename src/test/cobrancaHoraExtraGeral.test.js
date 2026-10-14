import { describe, it, expect } from 'vitest';
import { calcularCobrancaDoDia } from '../utils/attendanceUtils';

// Modo geral: entrada antecipada + saída tardia somadas numa faixa única.
const base = { contractedEntryTime: '07:30', contractedExitTime: '17:00' };
const geral = { billing_mode: 'general', general_tolerance_min: 30, general_bands_cents: [2500, 5000, 7500, 10000] };
const iso = (hhmm) => `2026-10-14T${hhmm}:00-03:00`;

describe('calcularCobrancaDoDia', () => {
  it('modo geral: soma dos dois lados dentro da faixa não cobra', () => {
    const r = calcularCobrancaDoDia({ ...base, entryIso: iso('07:10'), exitIso: iso('17:10'), billingConfig: geral });
    expect(r.minutos_excedentes).toBe(30);
    expect(r.valor).toBe(0);
    expect(r.dentro_tolerancia).toBe(true);
  });

  it('modo geral: soma acima da faixa cobra o valor fechado uma vez', () => {
    const r = calcularCobrancaDoDia({ ...base, entryIso: iso('07:10'), exitIso: iso('17:11'), billingConfig: geral });
    expect(r.minutos_excedentes).toBe(31);
    expect(r.valor).toBe(25);
    expect(r.faixa).toBe(1);
    expect(r.excessoEntrada).toBe(true);
    expect(r.excessoSaida).toBe(true);
  });

  it('modo geral: chegar atrasado ou sair cedo não gera minutos', () => {
    const r = calcularCobrancaDoDia({ ...base, entryIso: iso('08:00'), exitIso: iso('16:00'), billingConfig: geral });
    expect(r.minutos_excedentes).toBe(0);
    expect(r.valor).toBe(0);
  });

  it('modo geral: aluno isento nunca paga', () => {
    const r = calcularCobrancaDoDia({ ...base, entryIso: iso('06:00'), exitIso: iso('19:00'), billingConfig: geral, isentoHoraExtra: true });
    expect(r.valor).toBe(0);
  });

  it('modo individual (padrão) mantém a soma por lado', () => {
    const r = calcularCobrancaDoDia({ ...base, entryIso: iso('07:10'), exitIso: iso('17:20'), billingConfig: { billing_mode: 'individual' } });
    expect(r.valorEntrada).toBe(30);
    expect(r.valorSaida).toBe(30);
    expect(r.valor).toBe(60);
  });

  it('modo geral: sem saída hoje, o horário atual conta e já cobra ao passar da faixa', () => {
    const agora = new Date(iso('17:31'));
    const r = calcularCobrancaDoDia({ ...base, entryIso: iso('07:30'), exitIso: null, billingConfig: geral, agora });
    expect(r.minutos_excedentes).toBe(31);
    expect(r.valor).toBe(25);
    expect(r.parcial).toBe(true);
    expect(r.sem_saida).toBe(true);
  });

  it('modo geral: sem saída hoje, dentro da faixa ainda não cobra', () => {
    const r = calcularCobrancaDoDia({ ...base, entryIso: iso('07:30'), exitIso: null, billingConfig: geral, agora: new Date(iso('17:30')) });
    expect(r.valor).toBe(0);
  });

  it('modo geral: sem saída em dia passado não cobra (saída esquecida)', () => {
    const r = calcularCobrancaDoDia({ ...base, entryIso: iso('07:30'), exitIso: null, billingConfig: geral, agora: new Date('2026-10-15T20:00:00-03:00') });
    expect(r.valor).toBe(0);
    expect(r.parcial).toBe(false);
  });

  it('modo geral: faixas por total de minutos (tolerância 30, faixas de 30 min)', () => {
    const v = (min) => calcularCobrancaDoDia({ ...base, entryIso: iso('07:30'), exitIso: new Date(new Date(iso('17:00')).getTime() + min * 60000).toISOString(), billingConfig: geral }).valor;
    expect(v(30)).toBe(0);
    expect(v(31)).toBe(25);
    expect(v(60)).toBe(25);
    expect(v(61)).toBe(50);
    expect(v(75)).toBe(50);
    expect(v(120)).toBe(75);
    expect(v(121)).toBe(100);
    expect(v(600)).toBe(100); // acima da última faixa vale a última
  });
});
