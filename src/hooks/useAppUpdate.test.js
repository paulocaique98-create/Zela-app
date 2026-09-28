import { describe, it, expect } from 'vitest';
import { hasNewerBuild } from './useAppUpdate';

const fakeFetch = (body, ok = true) => async () => ({ ok, json: async () => body });

describe('hasNewerBuild · aviso de nova versão', () => {
  it('avisa quando o build publicado é outro', async () => {
    expect(await hasNewerBuild('abc', fakeFetch({ build: 'def' }))).toBe(true);
  });
  it('não avisa quando é o mesmo build', async () => {
    expect(await hasNewerBuild('abc', fakeFetch({ build: 'abc' }))).toBe(false);
  });
  it('não avisa sem arquivo de versão, com erro de rede ou sem build atual', async () => {
    expect(await hasNewerBuild('abc', fakeFetch(null, false))).toBe(false);
    expect(await hasNewerBuild('abc', async () => { throw new Error('offline'); })).toBe(false);
    expect(await hasNewerBuild(null, fakeFetch({ build: 'def' }))).toBe(false);
    expect(await hasNewerBuild('abc', fakeFetch({}))).toBe(false);
  });
});
