import { describe, it, expect } from 'vitest';
import { formatPersonName } from '../utils/formatName';

describe('formatPersonName', () => {
  it('normaliza nome todo em caixa alta', () => {
    expect(formatPersonName('DANIELE SAQUETTO TRESENA')).toBe('Daniele Saquetto Tresena');
  });

  it('mantém conectivos (de/da/do/das/dos/e) em minúsculo quando não são a 1ª palavra', () => {
    expect(formatPersonName('TATIANA PIMENTEL BRAGA DE NADAI')).toBe('Tatiana Pimentel Braga de Nadai');
    expect(formatPersonName('JOÃO DA SILVA E SOUZA')).toBe('João da Silva e Souza');
  });

  it('não mexe em nome já formatado corretamente', () => {
    expect(formatPersonName('Emerson Cruz')).toBe('Emerson Cruz');
    expect(formatPersonName('Gabriel Benz')).toBe('Gabriel Benz');
  });

  it('normaliza nome todo em minúsculo', () => {
    expect(formatPersonName('maria clara')).toBe('Maria Clara');
  });

  it('normaliza nome misturado', () => {
    expect(formatPersonName('mArIa ClArA')).toBe('Maria Clara');
  });

  it('capitaliza sub-palavras separadas por hífen', () => {
    expect(formatPersonName('ana-maria souza-lima')).toBe('Ana-Maria Souza-Lima');
  });

  it('capitaliza depois de apóstrofo', () => {
    expect(formatPersonName("o'connor")).toBe("O'Connor");
  });

  it('mantém acentuação e capitaliza letra acentuada', () => {
    expect(formatPersonName('ÓSCAR ÁVILA')).toBe('Óscar Ávila');
  });

  it('remove espaços duplicados e das pontas', () => {
    expect(formatPersonName('  MARIA   CLARA  ')).toBe('Maria Clara');
  });

  it('lida com valores vazios/nulos sem quebrar', () => {
    expect(formatPersonName('')).toBe('');
    expect(formatPersonName(null)).toBe(null);
    expect(formatPersonName(undefined)).toBe(undefined);
  });

  it('capitaliza conectivo quando é a primeira palavra do nome', () => {
    expect(formatPersonName('DA SILVA SANTOS')).toBe('Da Silva Santos');
  });
});
