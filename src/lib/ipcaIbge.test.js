import { describe, it, expect } from 'vitest';
import { lerIpcaIbge, URL_IPCA_IBGE } from '../../supabase/functions/_shared/ipcaIbge.ts';
import { rotuloReferencia, avisoReferencia } from './ipcaIbge.js';

const resposta = (serie) => [{ id: '2265', resultados: [{ classificacoes: [], series: [{ serie }] }] }];

describe('lerIpcaIbge (resposta do IBGE)', () => {
  it('usa o último período publicado e arredonda em 2 casas', () => {
    expect(lerIpcaIbge(resposta({ 202608: '4.22', 202609: '4.583' }))).toEqual({ periodo: '202609', ano: 2026, mes: 9, percentual: 4.58 });
  });

  it('pula mês sem valor ("-" ou "...") e usa o anterior', () => {
    expect(lerIpcaIbge(resposta({ 202611: '-', 202610: '4.5' })).periodo).toBe('202610');
    expect(lerIpcaIbge(resposta({ 202610: '4.5', 202611: '...' })).periodo).toBe('202610');
  });

  it('erro claro para resposta vazia, sem valor ou malformada', () => {
    expect(() => lerIpcaIbge([])).toThrow(/sem a série/);
    expect(() => lerIpcaIbge(null)).toThrow(/sem a série/);
    expect(() => lerIpcaIbge({ erro: 1 })).toThrow(/sem a série/);
    expect(() => lerIpcaIbge(resposta({ 202610: '-' }))).toThrow(/ainda não publicou/);
    expect(() => lerIpcaIbge(resposta({ abc: '4.5' }))).toThrow(/ainda não publicou/);
  });

  it('recusa valor fora de 0 a 30 (mesmo limite da RPC)', () => {
    expect(() => lerIpcaIbge(resposta({ 202610: '31.2' }))).toThrow(/fora do intervalo/);
    expect(() => lerIpcaIbge(resposta({ 202610: '-1.2' }))).toThrow(/fora do intervalo/);
  });

  it('a URL é fixa, https e do IBGE', () => {
    expect(URL_IPCA_IBGE.startsWith('https://servicodados.ibge.gov.br/')).toBe(true);
  });
});

describe('textos da tela', () => {
  it('rótulo do mês de referência', () => {
    expect(rotuloReferencia({ ano: 2026, mes: 9 })).toBe('setembro/2026');
  });
  it('só dezembro fecha o ano; antes disso avisa que é parcial', () => {
    expect(avisoReferencia({ ano: 2026, mes: 9, percentual: 4.58 })).toMatchObject({ parcial: true });
    expect(avisoReferencia({ ano: 2026, mes: 9, percentual: 4.58 }).texto).toContain('setembro/2026');
    expect(avisoReferencia({ ano: 2025, mes: 12, percentual: 4.26 })).toMatchObject({ parcial: false });
  });
});
