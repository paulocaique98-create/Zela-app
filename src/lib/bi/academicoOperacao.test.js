import { describe, it, expect } from 'vitest';
import { recortarHoras, primeiroNome, rotulosProfessoras, blocosDoMetodo } from './academicoOperacao';

const dia = () => Array.from({ length: 24 }, (_, hora) => ({ hora, entradas: 0, saidas: 0 }));

describe('recortarHoras', () => {
  it('mostra de 6h a 19h quando o movimento cabe nessa faixa', () => {
    const h = dia();
    h[8].entradas = 3;
    const r = recortarHoras(h);
    expect(r[0].rotulo).toBe('06h');
    expect(r.at(-1).rotulo).toBe('19h');
    expect(r).toHaveLength(14);
  });
  it('abre a faixa para movimento fora do horário comum', () => {
    const h = dia();
    h[5].entradas = 1;
    h[21].saidas = 2;
    const r = recortarHoras(h);
    expect(r[0].hora).toBe(5);
    expect(r.at(-1).hora).toBe(21);
  });
  it('entrada inválida vira lista vazia', () => {
    expect(recortarHoras(null)).toEqual([]);
  });
});

describe('rótulos de professoras', () => {
  it('usa o primeiro nome', () => {
    expect(primeiroNome('  Ana Paula Souza ')).toBe('Ana');
    expect(primeiroNome('')).toBe('Sem nome');
  });
  it('diferencia primeiros nomes repetidos pela inicial do sobrenome', () => {
    const r = rotulosProfessoras([
      { professora: 'Ana Souza', publicados: 2, pendentes: 1 },
      { professora: 'Ana Lima', publicados: 1, pendentes: 0 },
      { professora: 'Bia Costa', publicados: '3', pendentes: null },
    ]);
    expect(r.map(x => x.rotulo)).toEqual(['Ana S.', 'Ana L.', 'Bia']);
    expect(r[2]).toMatchObject({ publicados: 3, pendentes: 0 });
  });
});

describe('blocosDoMetodo', () => {
  it('sinaliza só os blocos devolvidos pelo servidor', () => {
    expect(blocosDoMetodo({ tradicional: { a: 1 }, montessori: null })).toEqual({ tradicional: true, montessori: false });
    expect(blocosDoMetodo(null)).toEqual({ tradicional: false, montessori: false });
  });
});
