import { describe, it, expect } from 'vitest';
import { gerarMensagemCobranca, formatarCnpj } from './mensagemCobrancaZela';

const escola = { school_code: 'A1B2C', name: 'Escola Teste', cnpj: '12345678000195' };
const cobranca = { invoice_url: 'https://asaas.com/i/abc', vencimento: '2026-11-03' };

describe('mensagemCobrancaZela', () => {
  it('formata o CNPJ', () => {
    expect(formatarCnpj('12345678000195')).toBe('12.345.678/0001-95');
    expect(formatarCnpj('123')).toBeNull();
  });

  it('gera a parcela 1 com os dados do pedido', () => {
    const r = gerarMensagemCobranca({ escola, cobranca });
    expect(r.ok).toBe(true);
    expect(r.mensagem).toContain('Parcela 1: https://asaas.com/i/abc');
    expect(r.mensagem).toContain('Vencimento: 03/11/2026');
    expect(r.mensagem).toContain('Codigo Negocio: A1B2C');
    expect(r.mensagem).toContain('Empresa: Escola Teste');
    expect(r.mensagem).toContain('CPF_CNPJ: 12.345.678/0001-95');
  });

  it('usa Parcela única no à vista e não cria linha de implantação', () => {
    const r = gerarMensagemCobranca({ escola, cobranca, aVista: true });
    expect(r.mensagem).toContain('Parcela única: https://asaas.com/i/abc');
    expect(r.mensagem).not.toMatch(/implanta/i);
  });

  it('bloqueia sem CNPJ válido', () => {
    const r = gerarMensagemCobranca({ escola: { ...escola, cnpj: null }, cobranca });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/CNPJ/);
  });

  it('bloqueia sem link', () => {
    const r = gerarMensagemCobranca({ escola, cobranca: { vencimento: '2026-11-03' } });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/link/);
  });
});
