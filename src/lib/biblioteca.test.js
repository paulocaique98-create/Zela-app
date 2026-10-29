import { describe, it, expect } from 'vitest';
import { situacaoEmprestimo, isbnValido, normalizarCodigo, somarDias, lerAcervo, dataBR } from './biblioteca';

describe('situacaoEmprestimo', () => {
  const hoje = '2026-11-10';
  it('classifica pelo prazo', () => {
    expect(situacaoEmprestimo({ devolver_ate: '2026-11-12' }, hoje).codigo).toBe('em_dia');
    expect(situacaoEmprestimo({ devolver_ate: '2026-11-10' }, hoje).codigo).toBe('vence_hoje');
    expect(situacaoEmprestimo({ devolver_ate: '2026-11-07' }, hoje)).toEqual({ codigo: 'atrasado', diasAtraso: 3 });
  });
  it('devolvido nunca é atrasado', () => {
    expect(situacaoEmprestimo({ devolver_ate: '2026-01-01', devolvido_em: '2026-02-01T10:00:00Z' }, hoje).codigo).toBe('devolvido');
  });
  it('soma dias atravessando o mês', () => {
    expect(somarDias('2026-11-28', 7)).toBe('2026-12-05');
    expect(dataBR('2026-12-05')).toBe('05/12/2026');
  });
});

describe('isbn e código', () => {
  it('valida dígito de ISBN 13 e 10, aceita em branco', () => {
    expect(isbnValido('')).toBe(true);
    expect(isbnValido('978-85-220-0873-5')).toBe(true);
    expect(isbnValido('9788522008731')).toBe(false);
    expect(isbnValido('0306406152')).toBe(true);
    expect(isbnValido('12345')).toBe(false);
  });
  it('limpa o que o leitor digita', () => {
    expect(normalizarCodigo(' T0001\n')).toBe('T0001');
  });
});

describe('lerAcervo', () => {
  const base = { Título: 'Pequeno Príncipe', Autor: 'Saint-Exupéry', ISBN: '9788522008735', Tombo: 'T1' };
  it('agrupa exemplares do mesmo livro', () => {
    const r = lerAcervo([base, { ...base, Tombo: 'T2', Estado: 'Regular' }]);
    expect(r.erros).toEqual([]);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].exemplares.map(e => e.tombo)).toEqual(['T1', 'T2']);
    expect(r.itens[0].exemplares[1].estado).toBe('regular');
  });
  it('aponta erros por linha', () => {
    const r = lerAcervo([
      { ...base, Tombo: '' },
      { ...base, Tombo: 'T1', ISBN: '123' },
      { ...base, Tombo: 'T9', Estado: 'Quebrado' },
      { ...base, Tombo: 'T5' },
      { ...base, Tombo: 'T5' },
      { ...base, Tombo: 'EXISTE' },
    ], new Set(['EXISTE']));
    expect(r.erros.map(e => e.linha)).toEqual([2, 3, 4, 6, 7]);
    expect(r.itens[0].exemplares).toHaveLength(1);
  });
});
