import { describe, it, expect, vi } from 'vitest';
import { buscarBuildPublicado, versaoNovaParaRecarregar, recarregarParaVersao, CHAVE_RECARGA_DE_VERSAO } from './versaoDoApp.js';

const respostaDe = (corpo, ok = true) => async () => ({ ok, json: async () => corpo });
const armazenamento = (inicial = {}) => {
  const dados = { ...inicial };
  return { getItem: (k) => (k in dados ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); }, dados };
};

describe('versão do app · conferência e recarga', () => {
  it('lê o build publicado; sem arquivo, rede fora ou build vazio dá null', async () => {
    expect(await buscarBuildPublicado(respostaDe({ build: 'b2' }))).toBe('b2');
    expect(await buscarBuildPublicado(respostaDe(null, false))).toBeNull();
    expect(await buscarBuildPublicado(async () => { throw new Error('offline'); })).toBeNull();
    expect(await buscarBuildPublicado(respostaDe({}))).toBeNull();
    expect(await buscarBuildPublicado(async () => ({ ok: true, json: async () => { throw new Error('html'); } }))).toBeNull();
  });

  it('só pede recarga quando o publicado é outro e ainda não recarregou para ele', async () => {
    const storage = armazenamento();
    expect(await versaoNovaParaRecarregar({ buildAtual: 'b1', fetchFn: respostaDe({ build: 'b1' }), storage })).toBeNull();
    expect(await versaoNovaParaRecarregar({ buildAtual: 'b1', fetchFn: respostaDe({ build: 'b2' }), storage })).toBe('b2');
    expect(await versaoNovaParaRecarregar({ buildAtual: null, fetchFn: respostaDe({ build: 'b2' }), storage })).toBeNull();
    // Já recarregou para b2 nesta sessão e continua no b1: não entra em laço.
    storage.setItem(CHAVE_RECARGA_DE_VERSAO, 'b2');
    expect(await versaoNovaParaRecarregar({ buildAtual: 'b1', fetchFn: respostaDe({ build: 'b2' }), storage })).toBeNull();
    // Uma publicação seguinte (b3) volta a valer.
    expect(await versaoNovaParaRecarregar({ buildAtual: 'b1', fetchFn: respostaDe({ build: 'b3' }), storage })).toBe('b3');
  });

  it('armazenamento bloqueado não impede a conferência nem a recarga', async () => {
    const quebrado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(await versaoNovaParaRecarregar({ buildAtual: 'b1', fetchFn: respostaDe({ build: 'b2' }), storage: quebrado })).toBe('b2');
    const recarregar = vi.fn();
    recarregarParaVersao('b2', { storage: quebrado, recarregar });
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it('recarga anota a versão antes de recarregar', () => {
    const storage = armazenamento();
    const recarregar = vi.fn(() => expect(storage.dados[CHAVE_RECARGA_DE_VERSAO]).toBe('b9'));
    recarregarParaVersao('b9', { storage, recarregar });
    expect(recarregar).toHaveBeenCalledTimes(1);
  });
});
