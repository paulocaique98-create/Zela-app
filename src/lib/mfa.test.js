import { describe, it, expect, vi, beforeEach } from 'vitest';

const mfa = {
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
};
vi.mock('./supabase', () => ({ supabase: { auth: { mfa } } }));

const { exigeSegundoFator, verificarCodigo, mfaObrigatorio } = await import('./mfa');

beforeEach(() => vi.clearAllMocks());

describe('exigeSegundoFator', () => {
  it('pede o código quando tem fator verificado e a sessão ainda é aal1', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1' }] }, error: null });
    expect(await exigeSegundoFator()).toEqual({ exige: true, factorId: 'f1' });
  });
  it('não pede quando a conta não tem Authenticator', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    expect((await exigeSegundoFator()).exige).toBe(false);
  });
  it('não pede de novo quando a sessão já é aal2', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    expect((await exigeSegundoFator()).exige).toBe(false);
  });
});

describe('verificarCodigo', () => {
  it('recusa código que não tem 6 dígitos sem chamar o servidor', async () => {
    await expect(verificarCodigo('f1', '123')).rejects.toThrow();
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
  it('aceita 6 dígitos (ignora espaços) e falha com mensagem amigável se o servidor recusar', async () => {
    mfa.challengeAndVerify.mockResolvedValue({ error: null });
    await expect(verificarCodigo('f1', '123 456')).resolves.toBeUndefined();
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' });
    mfa.challengeAndVerify.mockResolvedValue({ error: { message: 'x' } });
    await expect(verificarCodigo('f1', '123456')).rejects.toThrow(/inválido/);
  });
});

describe('mfaObrigatorio', () => {
  it('exige para developer/gestao/financeiro e não para recepcao (totem)', () => {
    expect(mfaObrigatorio('developer')).toBe(true);
    expect(mfaObrigatorio('gestao')).toBe(true);
    expect(mfaObrigatorio('recepcao')).toBe(false);
    expect(mfaObrigatorio('family')).toBe(false);
  });
});
