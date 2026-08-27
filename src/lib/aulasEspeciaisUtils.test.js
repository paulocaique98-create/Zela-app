import { describe, it, expect } from 'vitest';
import { formatRecorrencia } from './aulasEspeciaisUtils';

describe('formatRecorrencia', () => {
  it('retorna travessão quando não há dia da semana definido', () => {
    expect(formatRecorrencia({ dias_semana: [], frequencia: 'semanal' })).toBe('—');
    expect(formatRecorrencia({ frequencia: 'semanal' })).toBe('—');
  });

  it('semanal, 1 dia: "Toda Segunda-feira"', () => {
    expect(formatRecorrencia({ dias_semana: ['Segunda-feira'], frequencia: 'semanal' })).toBe('Toda Segunda-feira');
  });

  it('semanal, 2 dias: "Toda Terça-feira e Quinta-feira"', () => {
    expect(formatRecorrencia({ dias_semana: ['Terça-feira', 'Quinta-feira'], frequencia: 'semanal' }))
      .toBe('Toda Terça-feira e Quinta-feira');
  });

  it('mensal, 1 ocorrência: "Primeira Terça-feira do mês"', () => {
    expect(formatRecorrencia({ dias_semana: ['Terça-feira'], frequencia: 'mensal', ocorrencias_mes: ['primeira'] }))
      .toBe('Primeira Terça-feira do mês');
  });

  it('mensal, 2 ocorrências: "Primeira e última Quarta-feira do mês"', () => {
    expect(formatRecorrencia({ dias_semana: ['Quarta-feira'], frequencia: 'mensal', ocorrencias_mes: ['primeira', 'ultima'] }))
      .toBe('Primeira e última Quarta-feira do mês');
  });

  it('mensal sem ocorrência definida cai no fallback "<dias> do mês"', () => {
    expect(formatRecorrencia({ dias_semana: ['Sexta-feira'], frequencia: 'mensal', ocorrencias_mes: [] }))
      .toBe('Sexta-feira do mês');
  });
});
