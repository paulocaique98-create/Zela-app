import { describe, it, expect } from 'vitest';
import { atualizarMapaCores, corDaEntidade, CORES_CATEGORICAS, COR_OUTRAS } from './coresEntidade';

describe('atualizarMapaCores', () => {
  it('dá slots em ordem alfabética', () => {
    const mapa = atualizarMapaCores(['Maternal II', 'Berçário', 'Maternal I']);
    expect(mapa).toEqual({ 'Berçário': 0, 'Maternal I': 1, 'Maternal II': 2 });
  });
  it('não muda a cor de quem já tinha slot quando a lista encolhe ou cresce', () => {
    const base = atualizarMapaCores(['Berçário', 'Maternal I', 'Maternal II']);
    const filtrado = atualizarMapaCores(['Maternal II'], base);
    expect(filtrado['Maternal II']).toBe(base['Maternal II']);
    const maisUma = atualizarMapaCores(['Alfa', 'Maternal II'], base);
    expect(maisUma['Maternal II']).toBe(2);
    expect(maisUma['Alfa']).toBe(3);
  });
  it('ignora repetidos e vazios, sem mexer no mapa original', () => {
    const base = { A: 0 };
    const mapa = atualizarMapaCores(['A', 'B', 'B', '', null], base);
    expect(mapa).toEqual({ A: 0, B: 1 });
    expect(base).toEqual({ A: 0 });
  });
});

describe('corDaEntidade', () => {
  it('usa a cor do slot e cinza a partir do sexto', () => {
    const mapa = atualizarMapaCores(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(corDaEntidade(mapa, 'A')).toBe(CORES_CATEGORICAS[0]);
    expect(corDaEntidade(mapa, 'E')).toBe(CORES_CATEGORICAS[4]);
    expect(corDaEntidade(mapa, 'F')).toBe(COR_OUTRAS);
  });
  it('entidade desconhecida vira Outras', () => {
    expect(corDaEntidade({}, 'X')).toBe(COR_OUTRAS);
  });
});
