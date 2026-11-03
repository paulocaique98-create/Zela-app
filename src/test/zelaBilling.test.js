import { describe, it, expect } from 'vitest';
import {
  montarPagamentoAsaas, statusLocalDoAsaas, proximoStatus, tokenConfere, valorConfere, descricaoCobranca,
  planoAssinatura, somarMesesISO,
} from '../../supabase/functions/_shared/zelaBilling.ts';

const cb = { id: 'c1', tipo: 'parcela', numero: 2, vencimento: '2026-12-10', valor: '1234.5' };
const cfg = { multa_percent: '2.00', juros_mensal_percent: '1.00' };

describe('montarPagamentoAsaas', () => {
  it('boleto com multa e juros da configuração e id da cobrança como referência', () => {
    expect(montarPagamentoAsaas(cb, 'cus_1', cfg, 12)).toEqual({
      customer: 'cus_1', billingType: 'BOLETO', value: 1234.5, dueDate: '2026-12-10',
      description: 'Zela Edu: parcela 2 de 12', externalReference: 'c1',
      fine: { value: 2 }, interest: { value: 1 },
    });
  });
  it('recusa cliente ausente e valor zero', () => {
    expect(() => montarPagamentoAsaas(cb, '', cfg, 1)).toThrow();
    expect(() => montarPagamentoAsaas({ ...cb, valor: 0 }, 'cus_1', cfg, 1)).toThrow();
  });
  it('descrições', () => {
    expect(descricaoCobranca({ tipo: 'implantacao', numero: 1 }, 1)).toBe('Zela Edu: implantação');
    expect(descricaoCobranca({ tipo: 'parcela', numero: 1 }, 1)).toBe('Zela Edu: assinatura');
  });
});

describe('statusLocalDoAsaas e proximoStatus', () => {
  it('mapeia os status do Asaas', () => {
    expect(statusLocalDoAsaas('RECEIVED')).toBe('paga');
    expect(statusLocalDoAsaas('CONFIRMED')).toBe('paga');
    expect(statusLocalDoAsaas('OVERDUE')).toBe('vencida');
    expect(statusLocalDoAsaas('REFUNDED')).toBe('estornada');
    expect(statusLocalDoAsaas('PENDING', true)).toBe('cancelada');
    expect(statusLocalDoAsaas('ALGO_NOVO')).toBeNull();
  });
  it('evento atrasado não desfaz pagamento nem cancelamento', () => {
    expect(proximoStatus('paga', 'vencida')).toBeNull();
    expect(proximoStatus('paga', 'pendente')).toBeNull();
    expect(proximoStatus('cancelada', 'paga')).toBeNull();
    expect(proximoStatus('estornada', 'paga')).toBeNull();
  });
  it('transições válidas', () => {
    expect(proximoStatus('pendente', 'paga')).toBe('paga');
    expect(proximoStatus('pendente', 'vencida')).toBe('vencida');
    expect(proximoStatus('vencida', 'paga')).toBe('paga');
    expect(proximoStatus('vencida', 'pendente')).toBe('pendente');
    expect(proximoStatus('paga', 'estornada')).toBe('estornada');
    expect(proximoStatus('pendente', 'pendente')).toBeNull();
  });
});

describe('tokenConfere e valorConfere', () => {
  it('token', () => {
    expect(tokenConfere('abc', 'abc')).toBe(true);
    expect(tokenConfere('abd', 'abc')).toBe(false);
    expect(tokenConfere('abcd', 'abc')).toBe(false);
    expect(tokenConfere('', '')).toBe(false);
    expect(tokenConfere('abc', '')).toBe(false);
  });
  it('valor em centavos', () => {
    expect(valorConfere('1234.50', 1234.5)).toBe(true);
    expect(valorConfere(100, 99.99)).toBe(false);
  });
});

describe('assinatura do Asaas (continuação da contratação)', () => {
  it('soma meses sem derivar e cai no último dia do mês curto', () => {
    expect(somarMesesISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMesesISO('2026-11-30', 3)).toBe('2027-02-28');
    expect(somarMesesISO('2026-12-15', 12)).toBe('2027-12-15');
  });
  it('Mensal: assinatura mensal a partir do 2º mês', () => {
    expect(planoAssinatura({ primeiroVencimento: '2026-11-06', parcelas: 1, intervaloMeses: 1, valorSistema: '1500.00' }))
      .toEqual({ cycle: 'MONTHLY', value: 1500, nextDueDate: '2026-12-06' });
  });
  it('Anual à vista, 6x e 12x: renovação 12 meses depois da 1ª parcela', () => {
    expect(planoAssinatura({ primeiroVencimento: '2026-11-06', parcelas: 1, intervaloMeses: 12, valorSistema: 12000 }))
      .toEqual({ cycle: 'YEARLY', value: 12000, nextDueDate: '2027-11-06' });
    expect(planoAssinatura({ primeiroVencimento: '2026-11-06', parcelas: 6, intervaloMeses: 2, valorSistema: 2000 }))
      .toEqual({ cycle: 'BIMONTHLY', value: 2000, nextDueDate: '2027-11-06' });
    expect(planoAssinatura({ primeiroVencimento: '2026-11-06', parcelas: 12, intervaloMeses: 1, valorSistema: 1000 }))
      .toEqual({ cycle: 'MONTHLY', value: 1000, nextDueDate: '2027-11-06' });
  });
  it('recusa intervalo sem ciclo no Asaas e valor zero', () => {
    expect(() => planoAssinatura({ primeiroVencimento: '2026-11-06', parcelas: 1, intervaloMeses: 5, valorSistema: 10 })).toThrow();
    expect(() => planoAssinatura({ primeiroVencimento: '2026-11-06', parcelas: 1, intervaloMeses: 1, valorSistema: 0 })).toThrow();
  });
});
