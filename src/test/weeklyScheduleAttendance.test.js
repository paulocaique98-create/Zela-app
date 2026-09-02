import { describe, it, expect } from 'vitest';
import {
  getDayKeyFromDateStr,
  getEffectiveSchedule,
  mergeBillingConfig,
  DEFAULT_BILLING_CONFIG,
  calcularHorasExtras,
  calcularEntradaAntecipada,
} from '../utils/attendanceUtils.js';

// Testes puros (sem rede) da lógica de horários personalizados por dia da
// semana (students.weekly_schedule) + config de cobrança por escola
// (schools.billing_config) -- substitui a versão anterior (extra_hours, só
// somava minutos à saída). Mesma função usada tanto no relatório de horas
// extras (frontend) quanto, espelhada em
// supabase/functions/_shared/extraHours.ts, na Edge Function
// check-attendance-delays.

describe('getDayKeyFromDateStr', () => {
  it('deriva o dia da semana correto pra datas conhecidas, sem depender do fuso do runtime', () => {
    // 2026-09-01 é uma terça-feira (confirmado: calendário real).
    expect(getDayKeyFromDateStr('2026-09-01')).toBe('terca');
    expect(getDayKeyFromDateStr('2026-08-31')).toBe('segunda');
    expect(getDayKeyFromDateStr('2026-09-05')).toBe('sabado');
    expect(getDayKeyFromDateStr('2026-09-06')).toBe('domingo');
  });
});

describe('getEffectiveSchedule', () => {
  it('sem weeklySchedule ou sem override pro dia, usa o horário-base', () => {
    expect(getEffectiveSchedule(null, 'segunda', '07:00', '15:00')).toEqual({ entry: '07:00', exit: '15:00' });
    expect(getEffectiveSchedule({}, 'segunda', '07:00', '15:00')).toEqual({ entry: '07:00', exit: '15:00' });
    expect(getEffectiveSchedule({ terca: { entry: '06:00', exit: '17:00' } }, 'segunda', '07:00', '15:00')).toEqual({ entry: '07:00', exit: '15:00' });
  });

  it('com override completo (entry + exit) pro dia, substitui o horário-base', () => {
    expect(getEffectiveSchedule({ segunda: { entry: '06:00', exit: '17:00' } }, 'segunda', '07:00', '15:00')).toEqual({ entry: '06:00', exit: '17:00' });
  });

  it('normaliza "HH:MM:SS" (como vem do banco) pra "HH:MM"', () => {
    expect(getEffectiveSchedule(null, 'segunda', '07:00:00', '15:00:00')).toEqual({ entry: '07:00', exit: '15:00' });
  });
});

describe('mergeBillingConfig', () => {
  it('sem config da escola, usa os defaults', () => {
    expect(mergeBillingConfig(null)).toEqual(DEFAULT_BILLING_CONFIG);
  });

  it('mescla só os campos que a escola configurou, mantendo o resto no default', () => {
    expect(mergeBillingConfig({ hourly_rate_cents: 5000 })).toEqual({ ...DEFAULT_BILLING_CONFIG, hourly_rate_cents: 5000 });
  });
});

describe('calcularHorasExtras (check-out tardio) com weekly_schedule + billing_config', () => {
  it('dia SEM override -- comportamento idêntico ao horário-base (regressão)', () => {
    const exitIso = '2026-09-01T18:20:00.000Z'; // 15:20 em Brasília, terça
    const semOverride = calcularHorasExtras(exitIso, '15:00');
    const comWeeklyVazio = calcularHorasExtras(exitIso, '15:00', {});
    const comOverrideOutroDia = calcularHorasExtras(exitIso, '15:00', { quarta: { entry: '07:00', exit: '17:00' } });
    expect(semOverride).toEqual(comWeeklyVazio);
    expect(semOverride).toEqual(comOverrideOutroDia);
    // 20min > 15min tolerância padrão -> 5min excedentes -> 1h cheia (R$30 default)
    expect(semOverride.dentro_tolerancia).toBe(false);
    expect(semOverride.minutos_excedentes).toBe(5);
    expect(semOverride.valor).toBe(30);
  });

  it('dia COM override de saída -- tolerância desloca junto', () => {
    const exitIso = '2026-09-01T18:20:00.000Z'; // 15:20 em Brasília, terça
    const comOverride = calcularHorasExtras(exitIso, '15:00', { terca: { entry: '07:00', exit: '17:00' } });
    expect(comOverride.dentro_tolerancia).toBe(true);
    expect(comOverride.valor).toBe(0);
  });

  it('billing_config configurável -- tolerância e valor da hora diferentes do default', () => {
    const exitIso = '2026-09-01T18:20:00.000Z'; // 15:20 em Brasília, 20min depois do contratado
    const config = { late_checkout_tolerance_min: 30, hourly_rate_cents: 5000 };
    const comConfig = calcularHorasExtras(exitIso, '15:00', null, config);
    expect(comConfig.dentro_tolerancia).toBe(true); // 20min <= 30min tolerância configurada
    expect(comConfig.valor).toBe(0);
  });
});

describe('calcularEntradaAntecipada (check-in antecipado)', () => {
  it('chegada dentro da tolerância (5min default) não cobra', () => {
    // Contratado 07:00, chegou 06:57 (3min antes) -- dentro da tolerância.
    const entryIso = '2026-09-01T09:57:00.000Z'; // 06:57 em Brasília
    const r = calcularEntradaAntecipada(entryIso, '07:00');
    expect(r.dentro_tolerancia).toBe(true);
    expect(r.valor).toBe(0);
  });

  it('chegada além da tolerância cobra a partir do ponto de corte', () => {
    // Contratado 07:00, chegou 06:40 (20min antes) -- 15min excedentes após a tolerância de 5min.
    const entryIso = '2026-09-01T09:40:00.000Z'; // 06:40 em Brasília
    const r = calcularEntradaAntecipada(entryIso, '07:00');
    expect(r.dentro_tolerancia).toBe(false);
    expect(r.minutos_antecipados).toBe(15);
    expect(r.valor).toBe(30); // 1h cheia
  });

  it('respeita weekly_schedule (entrada mais cedo configurada pro dia)', () => {
    // Terça o aluno entra às 06:00 (override) -- chegar 05:58 está dentro da tolerância.
    const entryIso = '2026-09-01T08:58:00.000Z'; // 05:58 em Brasília
    const r = calcularEntradaAntecipada(entryIso, '07:00', { terca: { entry: '06:00', exit: '17:00' } });
    expect(r.dentro_tolerancia).toBe(true);
  });

  it('charge_early_checkin=false desliga a cobrança desse lado, mesmo com atraso grande', () => {
    const entryIso = '2026-09-01T09:00:00.000Z'; // 06:00 em Brasília, 1h antes do contratado
    const r = calcularEntradaAntecipada(entryIso, '07:00', null, { charge_early_checkin: false });
    expect(r.dentro_tolerancia).toBe(true);
    expect(r.valor).toBe(0);
  });

  it('sem entryTimeIso ou sem contractedEntryTime, não cobra', () => {
    expect(calcularEntradaAntecipada(null, '07:00').sem_entrada).toBe(true);
    expect(calcularEntradaAntecipada('2026-09-01T09:00:00.000Z', null).dentro_tolerancia).toBe(true);
  });
});
