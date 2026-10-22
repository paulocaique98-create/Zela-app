import { describe, it, expect } from 'vitest';
import { calcularOnboarding, PASSOS_ONBOARDING } from './onboardingChecklist';

describe('calcularOnboarding', () => {
  it('escola vazia: nada feito e primeiro passo é o próximo', () => {
    const r = calcularOnboarding({});
    expect(r.concluidos).toBe(0);
    expect(r.percentual).toBe(0);
    expect(r.proximo.id).toBe('turmas');
    expect(r.passos.every(p => p.feito === false)).toBe(true);
  });

  it('billing_config padrão ({}) não conta como horários definidos', () => {
    const r = calcularOnboarding({ billingConfig: {} });
    expect(r.passos.find(p => p.id === 'horarios').feito).toBe(false);
  });

  it('gateway só conta quando é true de verdade', () => {
    expect(calcularOnboarding({ gatewayConectado: 'sim' }).passos.find(p => p.id === 'asaas').feito).toBe(false);
    expect(calcularOnboarding({ gatewayConectado: true }).passos.find(p => p.id === 'asaas').feito).toBe(true);
  });

  it('progresso parcial aponta o primeiro passo pendente', () => {
    const r = calcularOnboarding({ turmas: ['Maternal'], billingConfig: { billing_mode: 'general' }, planos: 0, equipe: 2 });
    expect(r.concluidos).toBe(3);
    expect(r.percentual).toBe(60);
    expect(r.proximo.id).toBe('mensalidades');
  });

  it('sem Financeiro, os passos financeiros somem', () => {
    const r = calcularOnboarding({ financeiro: false, turmas: ['A'] });
    expect(r.passos.map(p => p.id)).toEqual(['turmas', 'equipe']);
    expect(r.percentual).toBe(50);
  });

  it('tudo feito: 100% e sem próximo', () => {
    const r = calcularOnboarding({ turmas: ['A'], billingConfig: { enabled: true }, planos: 4, gatewayConectado: true, equipe: 1 });
    expect(r.percentual).toBe(100);
    expect(r.proximo).toBeNull();
    expect(r.total).toBe(PASSOS_ONBOARDING.length);
  });
});
