import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('./auditLog', () => ({ logAction: vi.fn() }));

const { limiteEntradaMin, classificarPendencia, horarioContratadoDoDia } = await import('./saidasPendentes');

describe('horarioContratadoDoDia', () => {
  const aluno = { contracted_entry_time: '08:00:00', contracted_exit_time: '17:00:00', weekly_schedule: { quarta: { entry: '10:00', exit: '15:00' } } };
  it('usa o horário geral', () => {
    expect(horarioContratadoDoDia(aluno, '2026-11-04')).toEqual({ entry: '10:00', exit: '15:00' }); // quarta
    expect(horarioContratadoDoDia(aluno, '2026-11-05')).toEqual({ entry: '08:00', exit: '17:00' }); // quinta
  });
  it('sem horário nenhum devolve null', () => {
    expect(horarioContratadoDoDia({}, '2026-11-05')).toBeNull();
    expect(horarioContratadoDoDia(undefined, '2026-11-05')).toBeNull();
  });
});

const regraHoras = { entry_limit_hours: 4, entry_limit_fixed: null };

describe('limiteEntradaMin', () => {
  it('sem regra não há limite', () => {
    expect(limiteEntradaMin('10:00', null)).toBeNull();
  });
  it('horário contratado + N horas (Maitê 10h + 4h = 14h)', () => {
    expect(limiteEntradaMin('10:00:00', regraHoras)).toBe(14 * 60);
  });
  it('sem horário contratado usa o horário fixo da escola', () => {
    expect(limiteEntradaMin(null, { entry_limit_hours: 4, entry_limit_fixed: '12:00:00' })).toBe(12 * 60);
  });
  it('sem contratado e sem fixo: sem limite', () => {
    expect(limiteEntradaMin(null, regraHoras)).toBeNull();
  });
  it('não passa da meia-noite', () => {
    expect(limiteEntradaMin('22:00', { entry_limit_hours: 8 })).toBe(1439);
  });
});

describe('classificarPendencia', () => {
  it('Marina: único registro às 18:09 é entrada pendente', () => {
    expect(classificarPendencia({ totalRegistros: 1, horaRegistro: '18:09', contractedEntry: '08:00', rules: regraHoras })).toBe('entrada');
  });
  it('Maitê: registro às 11h é entrada, então falta a saída', () => {
    expect(classificarPendencia({ totalRegistros: 1, horaRegistro: '11:00', contractedEntry: '10:00', rules: regraHoras })).toBe('saida');
  });
  it('Maitê: registro às 15h já passou do limite', () => {
    expect(classificarPendencia({ totalRegistros: 1, horaRegistro: '15:00', contractedEntry: '10:00', rules: regraHoras })).toBe('entrada');
  });
  it('mais de um registro no dia segue como saída pendente', () => {
    expect(classificarPendencia({ totalRegistros: 3, horaRegistro: '18:09', contractedEntry: '08:00', rules: regraHoras })).toBe('saida');
  });
  it('sem regra configurada mantém o comportamento antigo', () => {
    expect(classificarPendencia({ totalRegistros: 1, horaRegistro: '18:09', contractedEntry: '08:00', rules: null })).toBe('saida');
  });
});
