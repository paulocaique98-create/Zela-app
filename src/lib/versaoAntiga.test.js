import { describe, it, expect } from 'vitest';
import { ehErroDeVersaoAntiga, recarregarParaVersaoNova, instalarRecuperacaoDeVersaoAntiga } from './versaoAntiga.js';

function armazenamento() {
  const dados = {};
  return { getItem: k => dados[k] ?? null, setItem: (k, v) => { dados[k] = v; } };
}

describe('versão antiga aberta depois de uma publicação', () => {
  it('reconhece as mensagens que apareceram na Recepção e no totem', () => {
    expect(ehErroDeVersaoAntiga(new TypeError('Failed to fetch dynamically imported module: https://sensekids.vercel.app/assets/AdminPortal-x.js'))).toBe(true);
    expect(ehErroDeVersaoAntiga(new TypeError("'text/html' is not a valid JavaScript MIME type."))).toBe(true);
    expect(ehErroDeVersaoAntiga(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(ehErroDeVersaoAntiga(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(ehErroDeVersaoAntiga(null)).toBe(false);
  });

  it('recarrega uma vez e não entra em repetição', () => {
    const storage = armazenamento();
    let recargas = 0;
    const recarregar = () => { recargas += 1; };
    expect(recarregarParaVersaoNova({ storage, recarregar, agora: 1_000_000 })).toBe(true);
    expect(recarregarParaVersaoNova({ storage, recarregar, agora: 1_030_000 })).toBe(false);
    expect(recargas).toBe(1);
    // Passado um minuto, pode tentar de novo (nova publicação no mesmo dia).
    expect(recarregarParaVersaoNova({ storage, recarregar, agora: 1_061_000 })).toBe(true);
    expect(recargas).toBe(2);
  });

  it('sem armazenamento disponível (navegação privada) ainda recarrega', () => {
    const quebrado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    let recargas = 0;
    expect(recarregarParaVersaoNova({ storage: quebrado, recarregar: () => { recargas += 1; }, agora: 999_999 })).toBe(true);
    expect(recargas).toBe(1);
  });

  it('escuta o aviso do Vite de tela que não carregou', () => {
    const ouvintes = {};
    instalarRecuperacaoDeVersaoAntiga({ addEventListener: (nome, fn) => { ouvintes[nome] = fn; } });
    expect(typeof ouvintes['vite:preloadError']).toBe('function');
  });
});
