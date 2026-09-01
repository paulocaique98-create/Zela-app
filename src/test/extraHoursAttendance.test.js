import { describe, it, expect } from 'vitest';
import {
  getDayKeyFromDateStr,
  getExtraHoursForDay,
  applyExtraHoursToTime,
  calcularHorasExtras,
} from '../utils/attendanceUtils.js';

// Testes puros (sem rede) da lógica de horas adicionais por dia da semana --
// mesma função usada tanto no relatório de horas extras (frontend) quanto,
// espelhada em supabase/functions/_shared/extraHours.ts, na Edge Function
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

describe('getExtraHoursForDay', () => {
  it('devolve 0 sem extraHours, sem a chave do dia, ou com valor não numérico', () => {
    expect(getExtraHoursForDay(null, 'segunda')).toBe(0);
    expect(getExtraHoursForDay({}, 'segunda')).toBe(0);
    expect(getExtraHoursForDay({ terca: 2 }, 'segunda')).toBe(0);
    expect(getExtraHoursForDay({ segunda: '2' }, 'segunda')).toBe(0); // string, não number
  });

  it('devolve o valor configurado quando existe e é positivo', () => {
    expect(getExtraHoursForDay({ segunda: 2, quarta: 1.5 }, 'segunda')).toBe(2);
    expect(getExtraHoursForDay({ segunda: 2, quarta: 1.5 }, 'quarta')).toBe(1.5);
  });
});

describe('applyExtraHoursToTime', () => {
  it('soma horas extras (casos de borda: 0.5h, 2h, 4h) ao horário contratado', () => {
    expect(applyExtraHoursToTime('15:00', 0.5)).toBe('15:30');
    expect(applyExtraHoursToTime('15:00', 2)).toBe('17:00');
    expect(applyExtraHoursToTime('15:00', 4)).toBe('19:00');
  });

  it('lida com virada de hora (minutos > 59) corretamente', () => {
    expect(applyExtraHoursToTime('15:45', 1.5)).toBe('17:15');
  });
});

describe('calcularHorasExtras com extra_hours (integração com o cálculo de tolerância/cobrança)', () => {
  it('dia SEM horas extras -- comportamento idêntico ao anterior (regressão)', () => {
    // Contratado 15:00, saída 15:20 (20min depois) -- sem extraHours.
    const exitIso = '2026-09-01T18:20:00.000Z'; // 15:20 em Brasília (-03:00)
    const semExtra = calcularHorasExtras(exitIso, '15:00');
    const comExtraVazio = calcularHorasExtras(exitIso, '15:00', {});
    const comExtraOutroDia = calcularHorasExtras(exitIso, '15:00', { quarta: 2 }); // hoje é terça
    expect(semExtra).toEqual(comExtraVazio);
    expect(semExtra).toEqual(comExtraOutroDia);
    // 20min > 15min tolerância -> 5min excedentes -> 1h cheia cobrada
    expect(semExtra.dentro_tolerancia).toBe(false);
    expect(semExtra.minutos_excedentes).toBe(5);
    expect(semExtra.valor).toBe(30);
  });

  it('dia COM horas extras -- tolerância desloca junto (não cobra o que já era esperado)', () => {
    // Mesmo horário de saída real (15:20), mas hoje (terça) o aluno tem 2h de
    // extra configuradas -- efetivo passa a ser 17:00, dentro da tolerância.
    const exitIso = '2026-09-01T18:20:00.000Z'; // 15:20 em Brasília
    const comExtra = calcularHorasExtras(exitIso, '15:00', { terca: 2 });
    expect(comExtra.dentro_tolerancia).toBe(true);
    expect(comExtra.valor).toBe(0);
  });

  it('saída depois do efetivo + tolerância ainda cobra, só que a partir do horário deslocado', () => {
    // Efetivo 17:00 (15:00 + 2h extra), tolerância até 17:15, saída real 17:30 -> 15min excedentes -> 1h cheia.
    const exitIso = '2026-09-01T20:30:00.000Z'; // 17:30 em Brasília
    const comExtra = calcularHorasExtras(exitIso, '15:00', { terca: 2 });
    expect(comExtra.dentro_tolerancia).toBe(false);
    expect(comExtra.minutos_excedentes).toBe(15);
    expect(comExtra.valor).toBe(30);
  });

  it('sem exitTimeIso ou sem contractedExitTime, extraHours não muda o resultado (guarda de entrada preservada)', () => {
    expect(calcularHorasExtras(null, '15:00', { terca: 2 }).sem_saida).toBe(true);
    expect(calcularHorasExtras('2026-09-01T18:20:00.000Z', null, { terca: 2 }).dentro_tolerancia).toBe(true);
  });
});
