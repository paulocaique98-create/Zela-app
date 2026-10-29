import { describe, it, expect } from 'vitest';
import { formularioVazio, validarOcorrencia, validarAnexo, montarPayload, pendenteDeCiencia, ordenarOcorrencias, hojeISO } from './ocorrencias';

const valido = () => ({ ...formularioVazio(), student_id: 'a1', descricao: 'Brigou no recreio' });

describe('validarOcorrencia', () => {
  it('aceita o formulário completo', () => {
    expect(validarOcorrencia(valido())).toBe('');
  });
  it('exige aluno e descrição', () => {
    expect(validarOcorrencia({ ...valido(), student_id: '' })).toMatch(/aluno/i);
    expect(validarOcorrencia({ ...valido(), descricao: '   ' })).toMatch(/descreva/i);
  });
  it('barra data futura', () => {
    expect(validarOcorrencia({ ...valido(), ocorrido_em: '2999-01-01' })).toMatch(/futura/);
  });
  it('ciência só com a família vendo', () => {
    expect(validarOcorrencia({ ...valido(), exige_ciencia: true, visivel_familia: false })).toMatch(/ciência/);
    expect(validarOcorrencia({ ...valido(), exige_ciencia: true, visivel_familia: true })).toBe('');
  });
  it('medida só para a Coordenação', () => {
    const f = { ...valido(), medida: 'advertencia' };
    expect(validarOcorrencia(f)).toMatch(/Coordenação/);
    expect(validarOcorrencia(f, { podeMedida: true })).toBe('');
    expect(validarOcorrencia({ ...f, medida: 'suspensao', medida_inicio: '2026-10-10', medida_fim: '2026-10-01' }, { podeMedida: true })).toMatch(/fim/);
  });
});

describe('montarPayload', () => {
  it('não leva ciência nem medida da professora', () => {
    const p = montarPayload({ ...valido(), medida: 'suspensao', exige_ciencia: true, visivel_familia: false }, { schoolId: 's', userId: 'u' });
    expect(p.medida).toBeUndefined();
    expect(p.exige_ciencia).toBe(false);
    expect(p.ciencia_em).toBeUndefined();
    expect(p.registrado_por).toBe('u');
    expect(p.school_id).toBe('s');
  });
  it('leva a medida quando a Coordenação decide', () => {
    const p = montarPayload({ ...valido(), medida: 'advertencia' }, { schoolId: 's', userId: 'u', podeMedida: true });
    expect(p.medida).toBe('advertencia');
  });
});

describe('validarAnexo', () => {
  it('aceita imagem e PDF até 10 MB', () => {
    expect(validarAnexo({ type: 'application/pdf', size: 1000 })).toBe('');
    expect(validarAnexo({ type: 'text/plain', size: 10 })).toMatch(/PDF/);
    expect(validarAnexo({ type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });
});

describe('ordem e ciência', () => {
  it('pendente só quando exige e não deu ciência', () => {
    expect(pendenteDeCiencia({ exige_ciencia: true, ciencia_em: null })).toBe(true);
    expect(pendenteDeCiencia({ exige_ciencia: true, ciencia_em: '2026-10-01' })).toBe(false);
    expect(pendenteDeCiencia({ exige_ciencia: false })).toBe(false);
  });
  it('mais recente primeiro', () => {
    const r = ordenarOcorrencias([{ id: 1, ocorrido_em: '2026-10-01' }, { id: 2, ocorrido_em: hojeISO() }]);
    expect(r[0].id).toBe(2);
  });
});
