import { describe, it, expect } from 'vitest';
import { calcularAcordo, somarMeses, diasDeAtraso, podeRomperAcordo } from '../lib/acordoDivida';

describe('acordoDivida', () => {
  it('divide o valor acordado e põe a sobra na primeira parcela', () => {
    const r = calcularAcordo({ valorOriginalCents: 100000, descontoCents: 1, parcelas: 3, primeiroVencimento: '2026-12-10', hoje: '2026-11-19' });
    expect(r.valorAcordadoCents).toBe(99999);
    expect(r.parcelas.map(p => p.amountCents)).toEqual([33333, 33333, 33333]);
    const r2 = calcularAcordo({ valorOriginalCents: 100000, descontoCents: 0, parcelas: 3, primeiroVencimento: '2026-12-10', hoje: '2026-11-19' });
    expect(r2.parcelas.map(p => p.amountCents)).toEqual([33334, 33333, 33333]);
    expect(r2.parcelas.reduce((s, p) => s + p.amountCents, 0)).toBe(100000);
  });

  it('mantém o dia do mês e cai no último dia em mês curto', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2026-11-15', 2)).toBe('2027-01-15');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('recusa desconto total, parcela mínima, vencimento passado e excesso de parcelas', () => {
    const base = { valorOriginalCents: 10000, descontoCents: 0, parcelas: 2, primeiroVencimento: '2026-12-01', hoje: '2026-11-19' };
    expect(calcularAcordo({ ...base, descontoCents: 10000 }).erro).toBeTruthy();
    expect(calcularAcordo({ ...base, parcelas: 25 }).erro).toBeTruthy();
    expect(calcularAcordo({ ...base, parcelas: 21 }).erro).toMatch(/R\$ 5,00/);
    expect(calcularAcordo({ ...base, primeiroVencimento: '2026-11-01' }).erro).toBeTruthy();
    expect(calcularAcordo({ ...base, valorOriginalCents: 0 }).erro).toBeTruthy();
    expect(calcularAcordo(base).erro).toBeUndefined();
  });

  it('rompe só com parcela atrasada há 30 dias ou mais', () => {
    expect(diasDeAtraso('2026-10-20', '2026-11-19')).toBe(30);
    expect(podeRomperAcordo([{ status: 'OVERDUE', dueDate: '2026-10-20' }], '2026-11-19')).toBe(true);
    expect(podeRomperAcordo([{ status: 'OVERDUE', dueDate: '2026-10-21' }], '2026-11-19')).toBe(false);
    expect(podeRomperAcordo([{ status: 'PAID', dueDate: '2026-01-01' }], '2026-11-19')).toBe(false);
  });
});
