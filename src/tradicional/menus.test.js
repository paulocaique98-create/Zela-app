import { describe, it, expect } from 'vitest';
import { ocultoNoTradicional, ABAS_SO_MONTESSORI } from './menus';

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
