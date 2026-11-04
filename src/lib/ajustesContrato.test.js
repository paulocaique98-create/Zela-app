import { describe, it, expect } from 'vitest';
import { gerarVencimentos, dividirSaldo, previaDesconto, vencimentosValidos, somarDiasISO } from './ajustesContrato';

describe('ajustesContrato', () => {
  it('encadeia 30 dias entre parcelas', () => {
    expect(gerarVencimentos('2026-12-10', 3)).toEqual(['2026-12-10', '2027-01-09', '2027-02-08']);
    expect(somarDiasISO('2026-01-31', 30)).toBe('2026-03-02');
  });
  it('divide o saldo sem perder centavos', () => {
    const p = dividirSaldo(100, 3);
    expect(p).toEqual([33.33, 33.33, 33.34]);
    expect(Math.round(p.reduce((a, b) => a + b, 0) * 100)).toBe(10000);
  });
  it('desconto só em pendente futura e não acumula', () => {
    const cobs = [
      { id: 'a', tipo: 'parcela', numero: 1, status: 'paga', vencimento: '2026-11-01', valor: 100, valor_sistema: 100, valor_implantacao: 0 },
      { id: 'b', tipo: 'parcela', numero: 2, status: 'pendente', vencimento: '2026-12-10', valor: 90, valor_sistema: 90, valor_sistema_original: 100, valor_implantacao: 0 },
      { id: 'c', tipo: 'parcela', numero: 3, status: 'vencida', vencimento: '2026-10-01', valor: 100, valor_sistema: 100, valor_implantacao: 0 },
    ];
    const r = previaDesconto(cobs, 1, 10, '2026-11-03');
    expect(r).toEqual([{ id: 'b', numero: 2, antes: 90, depois: 90 }]);
  });
  it('rejeita vencimento no passado ou vazio', () => {
    expect(vencimentosValidos(['2026-11-03'], '2026-11-03')).toBe(true);
    expect(vencimentosValidos(['2026-11-02'], '2026-11-03')).toBe(false);
    expect(vencimentosValidos([''], '2026-11-03')).toBe(false);
  });
});
