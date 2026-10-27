import { describe, it, expect } from 'vitest';
import { ocultoNoTradicional, ocultoPorFaltaDeMetodo, ABAS_SO_MONTESSORI } from './menus';

describe('ocultoNoTradicional', () => {
  it('esconde as abas do Montessori só na escola tradicional', () => {
    for (const aba of ABAS_SO_MONTESSORI) {
      expect(ocultoNoTradicional('tradicional', aba)).toBe(true);
    }
  });

  it('não esconde nada no Montessori, em método personalizado nem sem método', () => {
    for (const method of ['montessori', 'personalizado', null, undefined]) {
      for (const aba of ABAS_SO_MONTESSORI) {
        expect(ocultoNoTradicional(method, aba)).toBe(false);
      }
    }
  });

  it('não esconde outras abas', () => {
    expect(ocultoNoTradicional('tradicional', 'frequencia')).toBe(false);
    expect(ocultoNoTradicional('tradicional', 'home')).toBe(false);
  });
});

describe('ocultoPorFaltaDeMetodo', () => {
  it('mostra a Estrutura acadêmica só no Tradicional e no Personalizado', () => {
    expect(ocultoPorFaltaDeMetodo('tradicional', 'academico-estrutura')).toBe(false);
    expect(ocultoPorFaltaDeMetodo('personalizado', 'academico-estrutura')).toBe(false);
  });

  it('esconde no Montessori e sem método definido', () => {
    for (const method of ['montessori', null, undefined]) {
      expect(ocultoPorFaltaDeMetodo(method, 'academico-estrutura')).toBe(true);
    }
  });

  it('nunca esconde as demais abas', () => {
    for (const method of ['montessori', 'tradicional', null]) {
      expect(ocultoPorFaltaDeMetodo(method, 'academico-materias')).toBe(false);
    }
  });
});
