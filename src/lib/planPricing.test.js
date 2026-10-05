import { describe, it, expect } from 'vitest';
import {
  normalizarTurno, normalizarCiclo, planoDoAluno, calcularValorDoCiclo, valorMensalEquivalente, procurarPreco,
  mensagemSemPreco, anoDoPreco, primeiroVencimentoPadrao, avaliarMensalidadeDoAluno, aplicarPercentual, rotuloDoPlano,
  ROTULO_SITUACAO_DA_MENSALIDADE,
} from '../../supabase/functions/_shared/planPricing.ts';

const precos = [
  { school_year: 2026, ciclo_horas: 6, turno: 'Matutino', monthly_amount_cents: 120000 },
  { school_year: 2026, ciclo_horas: 8, turno: 'Vespertino', monthly_amount_cents: 150050 },
  { school_year: 2027, ciclo_horas: 6, turno: 'Matutino', monthly_amount_cents: 130000 },
];

const entrada = (extra = {}) => ({
  aluno: { contracted_hours: 6, turno: 'Matutino' },
  precos, ano: 2026, temContratoAtivo: false, temResponsavel: true, responsavelTemDocumento: true,
  bolsista: false, descontoPercent: 0, ...extra,
});

describe('planos de mensalidade · regras de preço', () => {
  it('ciclo e turno do cadastro do aluno, mesmo escritos de outro jeito', () => {
    expect(normalizarTurno('matutino ')).toBe('Matutino');
    expect(normalizarTurno('VESPERTINO')).toBe('Vespertino');
    expect(normalizarTurno('Integral')).toBeNull();
    expect(normalizarTurno(null)).toBeNull();
    expect(normalizarCiclo(6)).toBe(6);
    expect(normalizarCiclo('8')).toBe(8);
    expect(normalizarCiclo('10.0')).toBe(10);
    expect(normalizarCiclo(7)).toBeNull();
    expect(normalizarCiclo('')).toBeNull();
    expect(planoDoAluno({ contracted_hours: 8, turno: 'Vespertino' })).toEqual({ ciclo: 8, turno: 'Vespertino', faltando: [] });
    expect(planoDoAluno({ contracted_hours: null, turno: '' }).faltando).toEqual(['ciclo', 'turno']);
    expect(rotuloDoPlano(8, 'Vespertino')).toBe('8h Vespertino');
    expect(rotuloDoPlano(null, null)).toBe('sem ciclo e sem turno');
  });

  it('valor de cada cobrança: mensal x meses com o desconto, em centavos', () => {
    expect(calcularValorDoCiclo(120000, 'MONTHLY', 0)).toBe(120000);
    expect(calcularValorDoCiclo(120000, 'MONTHLY', 10)).toBe(108000);
    expect(calcularValorDoCiclo(120000, 'QUARTERLY', 5)).toBe(342000);
    expect(calcularValorDoCiclo(120000, 'SEMIANNUALLY', 8)).toBe(662400);
    expect(calcularValorDoCiclo(120000, 'YEARLY', 15)).toBe(1224000);
    expect(calcularValorDoCiclo(150050, 'MONTHLY', 3.33)).toBe(Math.round(150050 * (1 - 0.0333)));
    expect(calcularValorDoCiclo(100000, 'MONTHLY', Number.NaN)).toBe(100000);
    expect(() => calcularValorDoCiclo(100000, 'WEEKLY')).toThrow('Periodicidade inválida');
    expect(valorMensalEquivalente(342000, 'QUARTERLY')).toBe(114000);
  });

  it('preço da tabela por ano, ciclo e turno', () => {
    expect(procurarPreco(precos, 2026, 6, 'Matutino')).toBe(120000);
    expect(procurarPreco(precos, 2026, 6, 'Vespertino')).toBeNull();
    expect(procurarPreco(precos, 2027, 6, 'Matutino')).toBe(130000);
    expect(procurarPreco(precos, 2026, null, 'Matutino')).toBeNull();
    expect(procurarPreco(null, 2026, 6, 'Matutino')).toBeNull();
    expect(mensagemSemPreco(8, 'Vespertino', 2026)).toBe('Cadastre o preço de 8h Vespertino de 2026 em Financeiro · Planos.');
    expect(mensagemSemPreco(8, 'Vespertino', 2026)).not.toContain('-');
  });

  it('ano do preço: o informado ou o do 1º vencimento', () => {
    expect(anoDoPreco('2027-01-10')).toBe(2027);
    expect(anoDoPreco('2026-12-10', 2027)).toBe(2027);
    expect(anoDoPreco('2026-12-10', null)).toBe(2026);
  });

  it('1º vencimento padrão: o próximo dia escolhido que ainda não passou', () => {
    expect(primeiroVencimentoPadrao('2026-10-04', 10)).toBe('2026-10-10');
    expect(primeiroVencimentoPadrao('2026-10-10', 10)).toBe('2026-11-10');
    expect(primeiroVencimentoPadrao('2026-10-25', 5)).toBe('2026-11-05');
    expect(primeiroVencimentoPadrao('2026-12-20', 5)).toBe('2027-01-05');
  });

  it('situação do aluno na lista de mensalidades, na ordem de prioridade', () => {
    const pronto = avaliarMensalidadeDoAluno(entrada({ descontoPercent: 10 }));
    expect(pronto).toMatchObject({ situacao: 'pronto', mensalCents: 120000, valorDoCicloCents: 108000, ciclo: 6, turno: 'Matutino', ano: 2026 });
    const trimestral = avaliarMensalidadeDoAluno(entrada({ periodicidade: 'QUARTERLY', descontoPercent: 5 }));
    expect(trimestral.valorDoCicloCents).toBe(342000);
    expect(avaliarMensalidadeDoAluno(entrada({ temContratoAtivo: true, bolsista: true })).situacao).toBe('ja_tem');
    expect(avaliarMensalidadeDoAluno(entrada({ bolsista: true })).situacao).toBe('bolsista');
    expect(avaliarMensalidadeDoAluno(entrada({ bolsista: true, aluno: { contracted_hours: null, turno: null } })).situacao).toBe('bolsista');
    expect(avaliarMensalidadeDoAluno(entrada({ aluno: { contracted_hours: null, turno: 'Matutino' } }))).toMatchObject({ situacao: 'sem_plano', faltando: ['ciclo'] });
    expect(avaliarMensalidadeDoAluno(entrada({ temResponsavel: false })).situacao).toBe('sem_responsavel');
    expect(avaliarMensalidadeDoAluno(entrada({ responsavelTemDocumento: false })).situacao).toBe('sem_documento');
    expect(avaliarMensalidadeDoAluno(entrada({ aluno: { contracted_hours: 10, turno: 'Vespertino' } })).situacao).toBe('sem_preco');
    expect(avaliarMensalidadeDoAluno(entrada({ ano: 2028 })).situacao).toBe('sem_preco');
  });

  it('rótulos sem hífen e reajuste por percentual', () => {
    for (const rotulo of Object.values(ROTULO_SITUACAO_DA_MENSALIDADE)) expect(rotulo).not.toContain('-');
    expect(aplicarPercentual(120000, 5)).toBe(126000);
    expect(aplicarPercentual(120000, -10)).toBe(108000);
    expect(aplicarPercentual(1, -99)).toBe(1);
  });
});
