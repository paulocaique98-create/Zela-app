import { describe, it, expect } from 'vitest';
import { expandCardapiosToCandidates } from './cardapioIaParser';

const CARDAPIOS = [
  { numero: 1, dias: { 'Segunda-feira': { Desjejum: 'Maçã', Almoço: 'Arroz e feijão' } } },
  { numero: 2, dias: { 'Segunda-feira': { Desjejum: 'Banana' } } },
];

describe('expandCardapiosToCandidates', () => {
  it('retorna [] se faltar qualquer argumento', () => {
    expect(expandCardapiosToCandidates([], '2026-01-05', '2026-01-10')).toEqual([]);
    expect(expandCardapiosToCandidates(CARDAPIOS, '', '2026-01-10')).toEqual([]);
    expect(expandCardapiosToCandidates(CARDAPIOS, '2026-01-05', '')).toEqual([]);
  });

  it('aplica o cardápio 1 na primeira segunda-feira do período', () => {
    // 2026-01-05 é uma segunda-feira real
    const result = expandCardapiosToCandidates(CARDAPIOS, '2026-01-05', '2026-01-05');
    expect(result).toEqual([
      { id: 0, date: '2026-01-05', descricao: 'Maçã', refeicao: 'Desjejum', selected: true },
      { id: 1, date: '2026-01-05', descricao: 'Arroz e feijão', refeicao: 'Almoço', selected: true },
    ]);
  });

  it('roda em rotação: semana 2 usa o cardápio 2, semana 3 volta ao cardápio 1 (ciclo)', () => {
    const result = expandCardapiosToCandidates(CARDAPIOS, '2026-01-05', '2026-01-19');
    const desjejumPorData = Object.fromEntries(
      result.filter(c => c.refeicao === 'Desjejum').map(c => [c.date, c.descricao])
    );
    expect(desjejumPorData['2026-01-05']).toBe('Maçã'); // semana 1 -> cardápio 1
    expect(desjejumPorData['2026-01-12']).toBe('Banana'); // semana 2 -> cardápio 2
    expect(desjejumPorData['2026-01-19']).toBe('Maçã'); // semana 3 -> cardápio 1 de novo
  });

  it('não inclui datas além do período final', () => {
    const result = expandCardapiosToCandidates(CARDAPIOS, '2026-01-05', '2026-01-05');
    expect(result.every(c => c.date <= '2026-01-05')).toBe(true);
  });

  it('ignora refeições com texto vazio', () => {
    const cardapiosComVazio = [{ numero: 1, dias: { 'Segunda-feira': { Desjejum: '   ', Almoço: 'Arroz' } } }];
    const result = expandCardapiosToCandidates(cardapiosComVazio, '2026-01-05', '2026-01-05');
    expect(result).toHaveLength(1);
    expect(result[0].refeicao).toBe('Almoço');
  });
});
