import { describe, it, expect } from 'vitest';
import { statusParcela, nomeParcela, linkSeguro, resumoParcelas } from './assinaturaZela';

const parcelas = [
  { tipo: 'parcela', numero: 1, vencimento: '2026-10-10', valor: 100, status: 'paga' },
  { tipo: 'parcela', numero: 2, vencimento: '2026-11-10', valor: 100, status: 'vencida' },
  { tipo: 'parcela', numero: 3, vencimento: '2026-12-10', valor: 100, status: 'pendente' },
  { tipo: 'parcela', numero: 4, vencimento: '2027-01-10', valor: 100, status: 'cancelada' },
];

describe('assinaturaZela', () => {
  it('rotula status e nome da parcela', () => {
    expect(statusParcela('vencida').label).toBe('Em atraso');
    expect(statusParcela('xyz').label).toBe('xyz');
    expect(nomeParcela({ tipo: 'implantacao', numero: 1 })).toBe('Implantação');
    expect(nomeParcela({ tipo: 'parcela', numero: 3 })).toBe('Parcela 3');
  });

  it('aceita só link https', () => {
    expect(linkSeguro('https://pagar.exemplo/a')).toBe('https://pagar.exemplo/a');
    expect(linkSeguro('javascript:alert(1)')).toBeNull();
    expect(linkSeguro('http://inseguro')).toBeNull();
    expect(linkSeguro(null)).toBeNull();
  });

  it('resume pago, em aberto, atraso e próxima parcela (canceladas ficam fora)', () => {
    const r = resumoParcelas(parcelas);
    expect(r.pago).toBe(100);
    expect(r.emAberto).toBe(200);
    expect(r.emAtraso).toBe(100);
    expect(r.proxima.numero).toBe(2);
  });

  it('lista vazia ou inválida não quebra', () => {
    expect(resumoParcelas(null).proxima).toBeNull();
    expect(resumoParcelas([]).pago).toBe(0);
  });
});
