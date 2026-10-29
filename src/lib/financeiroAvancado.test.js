import { describe, it, expect } from 'vitest';
import { mesesDoPeriodo, montarDre, montarFluxo } from './financeiroAvancado';

describe('financeiroAvancado', () => {
  it('lista os meses do período, inclusive na virada de ano', () => {
    expect(mesesDoPeriodo('2026-11-15', '2027-01-10')).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('monta o DRE em cascata com resultado por mês e total', () => {
    const dre = montarDre({
      receita_por_mes: { '2026-09': 15000 },
      despesa_por_grupo_mes: [
        { mes: '2026-09', grupo: 'pessoal', cents: 4000 },
        { mes: '2026-10', grupo: 'ocupacao', cents: 1500 },
      ],
    }, '2026-09-01', '2026-10-31');
    expect(dre.receita.total).toBe(15000);
    expect(dre.grupos.map(g => g.id)).toEqual(['pessoal', 'ocupacao']);
    expect(dre.despesas.total).toBe(5500);
    expect(dre.resultado.porMes).toEqual({ '2026-09': 11000, '2026-10': -1500 });
    expect(dre.resultado.total).toBe(9500);
  });

  it('projeta o saldo com a taxa média e avisa quando fica negativo', () => {
    const f = montarFluxo({
      saldo_inicial_cents: 1000, taxa_media: 0.8, taxa_min: 0.5, taxa_max: 1,
      semanas: [
        { semana: '2026-11-02', entradas_cents: 10000, saidas_cents: 2000 },
        { semana: '2026-11-09', entradas_cents: 0, saidas_cents: 9000 },
      ],
    });
    expect(f.semanas[0].esperado).toBe(7000);
    expect(f.semanas[0].otimista).toBe(9000);
    expect(f.semanas[0].pessimista).toBe(4000);
    expect(f.semanas[1].esperado).toBe(-2000);
    expect(f.saldoNegativo).toBe(true);
    expect(f.primeiraSemanaNegativa).toBe('2026-11-09');
  });

  it('sem histórico usa taxa 1 e sem saldo informado parte de zero', () => {
    const f = montarFluxo({ saldo_inicial_cents: null, taxa_media: null, semanas: [{ semana: '2026-11-02', entradas_cents: 500, saidas_cents: 0 }] });
    expect(f.semHistorico).toBe(true);
    expect(f.saldoInicial).toBeNull();
    expect(f.semanas[0].esperado).toBe(500);
  });
});
