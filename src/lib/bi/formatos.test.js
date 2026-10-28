import { describe, it, expect } from 'vitest';
import { formatarNumero, formatarPercentual, formatarMoeda, calcularVariacao } from './formatos';

describe('formatos', () => {
  it('formata número e percentual em pt-BR', () => {
    expect(formatarNumero(1234)).toBe('1.234');
    expect(formatarPercentual(12.5)).toBe('12,5%');
    expect(formatarPercentual(0)).toBe('0%');
  });
  it('valor ausente vira ponto médio, não zero', () => {
    expect(formatarNumero(null)).toBe('·');
    expect(formatarPercentual(undefined)).toBe('·');
    expect(formatarMoeda(null)).toBe('·');
  });
  it('moeda recebe centavos', () => {
    expect(formatarMoeda(123456)).toMatch(/1\.234,56/);
  });
});

describe('calcularVariacao', () => {
  it('alta de indicador que quanto maior melhor é boa', () => {
    const v = calcularVariacao(112, 100);
    expect(v).toMatchObject({ direcao: 'up', tom: 'good', texto: '12% acima' });
  });
  it('alta de inadimplência é ruim', () => {
    const v = calcularVariacao(12, 10, { maisEhMelhor: false });
    expect(v).toMatchObject({ direcao: 'up', tom: 'bad', texto: '20% acima' });
  });
  it('queda de inadimplência é boa', () => {
    expect(calcularVariacao(8, 10, { maisEhMelhor: false })).toMatchObject({ direcao: 'down', tom: 'good', texto: '20% abaixo' });
  });
  it('sem variação', () => {
    expect(calcularVariacao(10, 10)).toMatchObject({ direcao: 'flat', tom: 'neutral', texto: 'Sem variação' });
  });
  it('sem base de comparação devolve null', () => {
    expect(calcularVariacao(10, 0)).toBeNull();
    expect(calcularVariacao(10, null)).toBeNull();
    expect(calcularVariacao(null, 10)).toBeNull();
  });
  it('o texto nunca usa hífen', () => {
    expect(calcularVariacao(5, 10).texto).not.toContain('-');
  });
});
