import { describe, it, expect } from 'vitest';
import { PEDAGOGICAL_METHOD_DEFAULTS } from './schoolConfig';

// Cobertura da parte pura (sem DOM/rede) do hook -- os defaults por
// método, que são a peça central da personalização de terminologia.
describe('PEDAGOGICAL_METHOD_DEFAULTS', () => {
  it('tradicional usa "Turma"/"Professor(a)"', () => {
    expect(PEDAGOGICAL_METHOD_DEFAULTS.tradicional.terminology.class).toBe('Turma');
    expect(PEDAGOGICAL_METHOD_DEFAULTS.tradicional.terminology.teacher).toBe('Professor(a)');
  });

  it('montessori usa "Agrupamento"/"Guia"', () => {
    expect(PEDAGOGICAL_METHOD_DEFAULTS.montessori.terminology.class).toBe('Agrupamento');
    expect(PEDAGOGICAL_METHOD_DEFAULTS.montessori.terminology.teacher).toBe('Guia');
  });

  it('montessori usa "Área de Conhecimento" no lugar de "Matéria" (AdminSubjects.jsx)', () => {
    expect(PEDAGOGICAL_METHOD_DEFAULTS.tradicional.terminology.subject).toBe('Matéria');
    expect(PEDAGOGICAL_METHOD_DEFAULTS.montessori.terminology.subject).toBe('Área de Conhecimento');
  });

  it('personalizado cai no vocabulário tradicional por padrão (escola ainda não customizou nada)', () => {
    expect(PEDAGOGICAL_METHOD_DEFAULTS.personalizado.terminology.class).toBe('Turma');
  });
});
