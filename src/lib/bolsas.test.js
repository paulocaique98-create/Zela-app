import { describe, it, expect } from 'vitest';
import {
  descricaoDoBeneficio, reaisParaCentavos, vigenteEm, diasParaFim, precisaRenovar, vagasRestantes, tipoAceitaPedido,
} from './bolsas.js';
import { descontoComBolsas, percentualDaBolsa, bolsaVigenteEm } from '../../supabase/functions/_shared/scholarshipDiscount.ts';

const bolsa = (percentual, extra = {}) => ({ percentual, valor_cents: null, cumulativa: true, ...extra });

describe('descontoComBolsas (regra do servidor)', () => {
  it('sem bolsa mantém só o desconto da família', () => {
    expect(descontoComBolsas(100000, 10, [])).toEqual({ total: 10, bolsa: 0, limitado: false });
  });

  it('bolsa cumulativa soma com o desconto da família', () => {
    expect(descontoComBolsas(100000, 10, [bolsa(30)]).total).toBe(40);
  });

  it('bolsas somam entre si', () => {
    expect(descontoComBolsas(100000, 0, [bolsa(20), bolsa(15)])).toEqual({ total: 35, bolsa: 35, limitado: false });
  });

  it('bolsa não cumulativa vale o maior entre família e bolsa', () => {
    expect(descontoComBolsas(100000, 10, [bolsa(30, { cumulativa: false })]).total).toBe(30);
    expect(descontoComBolsas(100000, 40, [bolsa(30, { cumulativa: false })]).total).toBe(40);
  });

  it('respeita o limite configurado da escola', () => {
    const r = descontoComBolsas(100000, 20, [bolsa(50)], 60);
    expect(r).toEqual({ total: 60, bolsa: 50, limitado: true });
  });

  it('padrão de 100% nunca passa de 100', () => {
    expect(descontoComBolsas(100000, 60, [bolsa(70)]).total).toBe(100);
  });

  it('bolsa em valor vira percentual sobre o mensal base', () => {
    expect(percentualDaBolsa({ percentual: null, valor_cents: 25000, cumulativa: true }, 100000)).toBe(25);
    expect(percentualDaBolsa({ percentual: null, valor_cents: 250000, cumulativa: true }, 100000)).toBe(100);
  });

  it('bolsa vigente exclui encerrada, futura e vencida', () => {
    expect(bolsaVigenteEm({ inicio: '2026-01-01', fim: null, encerrada_em: null }, '2026-10-29')).toBe(true);
    expect(bolsaVigenteEm({ inicio: '2026-01-01', fim: '2026-06-30', encerrada_em: null }, '2026-10-29')).toBe(false);
    expect(bolsaVigenteEm({ inicio: '2027-01-01', fim: null, encerrada_em: null }, '2026-10-29')).toBe(false);
    expect(bolsaVigenteEm({ inicio: '2026-01-01', fim: null, encerrada_em: '2026-05-01T00:00:00Z' }, '2026-10-29')).toBe(false);
  });
});

describe('apoio de tela das bolsas', () => {
  it('descreve o benefício', () => {
    expect(descricaoDoBeneficio({ percentual: 30 })).toBe('30%');
    expect(descricaoDoBeneficio({ percentual: null, valor_cents: 20000 })).toContain('por mês');
  });

  it('converte reais em centavos', () => {
    expect(reaisParaCentavos('1.500,50')).toBe(150050);
    expect(reaisParaCentavos('abc')).toBe(0);
    expect(reaisParaCentavos('')).toBe(0);
  });

  it('avisa a renovação 30 dias antes do fim', () => {
    const g = (fim) => ({ inicio: '2026-01-01', fim, encerrada_em: null });
    expect(diasParaFim('2026-11-10', '2026-10-29')).toBe(12);
    expect(precisaRenovar(g('2026-11-10'), '2026-10-29')).toBe(true);
    expect(precisaRenovar(g('2026-12-31'), '2026-10-29')).toBe(false);
    expect(precisaRenovar(g(null), '2026-10-29')).toBe(false);
    expect(precisaRenovar(g('2026-10-01'), '2026-10-29')).toBe(false);
    expect(vigenteEm(g('2026-10-29'), '2026-10-29')).toBe(true);
  });

  it('conta vagas restantes só com concessões vigentes', () => {
    const tipo = { id: 't1', vagas: 2 };
    const concessoes = [
      { type_id: 't1', inicio: '2026-01-01', fim: null, encerrada_em: null },
      { type_id: 't1', inicio: '2025-01-01', fim: '2025-12-31', encerrada_em: null },
      { type_id: 't2', inicio: '2026-01-01', fim: null, encerrada_em: null },
    ];
    expect(vagasRestantes(tipo, concessoes, '2026-10-29')).toBe(1);
    expect(vagasRestantes({ id: 't1', vagas: null }, concessoes, '2026-10-29')).toBeNull();
  });

  it('tipo só aceita pedido ativo e dentro da vigência', () => {
    expect(tipoAceitaPedido({ ativo: true }, '2026-10-29')).toBe(true);
    expect(tipoAceitaPedido({ ativo: false }, '2026-10-29')).toBe(false);
    expect(tipoAceitaPedido({ ativo: true, vigencia_fim: '2026-09-30' }, '2026-10-29')).toBe(false);
    expect(tipoAceitaPedido({ ativo: true, vigencia_inicio: '2027-01-01' }, '2026-10-29')).toBe(false);
  });
});
