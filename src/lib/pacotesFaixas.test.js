import { describe, it, expect } from 'vitest';
import { FAIXAS_PACOTE, custoPorAlunoDoPlano, linhaDoPacote, linhasDoPacote, valorFinalDaFaixa, reajustarCusto } from './pacotesFaixas';

describe('FAIXAS_PACOTE', () => {
  it('tem as 36 faixas, de 50 a 1000', () => {
    expect(FAIXAS_PACOTE).toHaveLength(36);
    expect(FAIXAS_PACOTE.slice(0, 7)).toEqual([50, 60, 70, 80, 90, 100, 120]);
    expect(FAIXAS_PACOTE[25]).toBe(500);
    expect(FAIXAS_PACOTE[26]).toBe(550);
    expect(FAIXAS_PACOTE.at(-1)).toBe(1000);
  });
});

describe('linhaDoPacote', () => {
  it('Básico até 50: custo 1,50 e imposto 15 por cento', () => {
    const l = linhaDoPacote(50, 299, 1.5, 15);
    expect(l.custo).toBe(75);
    expect(l.imposto).toBe(44.85);
    expect(l.custoTotal).toBe(119.85);
    expect(l.lucro).toBe(179.15);
    expect(l.margem).toBeCloseTo(59.9, 1);
    expect(l.media).toBeCloseTo(5.98, 2);
  });

  it('Básico até 1000 fecha em 55,1 por cento', () => {
    const l = linhaDoPacote(1000, 5009, 1.5, 15);
    expect(l.lucro).toBe(2757.65);
    expect(l.margem).toBeCloseTo(55.05, 1);
  });

  it('custo maior reduz o lucro sem mexer no preço final', () => {
    const a = linhaDoPacote(100, 549, 1.5, 15);
    const b = linhaDoPacote(100, 549, 1.8, 15);
    expect(b.final).toBe(a.final);
    expect(b.lucro).toBeLessThan(a.lucro);
  });
});

describe('linhasDoPacote', () => {
  it('ignora faixa sem preço e mantém a ordem', () => {
    const linhas = linhasDoPacote({ 60: 349, 50: 299 }, 1.5, 15);
    expect(linhas.map(l => l.faixa)).toEqual([50, 60]);
  });
});

describe('valorFinalDaFaixa', () => {
  it('com o custo de referência o preço não muda', () => {
    expect(valorFinalDaFaixa(299, 1.5, 1.5)).toBe(299);
    expect(valorFinalDaFaixa(5009, 1.5, 1.5)).toBe(5009);
  });
  it('custo maior sobe o preço e termina em 9', () => {
    expect(valorFinalDaFaixa(299, 1.8, 1.5)).toBe(359);
    expect(valorFinalDaFaixa(549, 1.8, 1.5)).toBe(659);
  });
  it('sem custo de referência mantém o preço', () => {
    expect(valorFinalDaFaixa(299, 2, null)).toBe(299);
  });
  it('mantém a margem ao escalar o custo', () => {
    const base = linhaDoPacote(100, 549, 1.5, 15).margem;
    const l = linhasDoPacote({ 100: 549 }, 1.8, 15, 1.5)[0];
    expect(l.margem).toBeCloseTo(base, 0);
    expect(l.media).toBeCloseTo(l.final / 100, 5);
  });
});

describe('reajustarCusto', () => {
  it('R$ 1,50 com 4 por cento vira R$ 1,56', () => {
    expect(reajustarCusto(1.5, 4)).toBe(1.56);
  });
  it('arredonda em centavos', () => {
    expect(reajustarCusto(2.05, 4.83)).toBe(2.15);
  });
});

describe('custoPorAlunoDoPlano', () => {
  const PRECOS = [
    { item_id: 'base', custo_estimado: 1.5 },
    { item_id: 'pedagogico', custo_estimado: 0.15 },
    { item_id: 'rotina', custo_estimado: 0.15 },
  ];
  it('usa o custo informado no plano', () => {
    expect(custoPorAlunoDoPlano({ custo_por_aluno: 1.5, itens: ['pedagogico', 'rotina'] }, PRECOS)).toBe(1.5);
  });
  it('sem custo informado, soma o base e os módulos', () => {
    expect(custoPorAlunoDoPlano({ custo_por_aluno: null, itens: ['pedagogico', 'rotina'] }, PRECOS)).toBe(1.8);
  });
  it('custo zero informado vale zero', () => {
    expect(custoPorAlunoDoPlano({ custo_por_aluno: 0, itens: [] }, PRECOS)).toBe(0);
  });
});
