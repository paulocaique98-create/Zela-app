import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { anoDoResultado, montarHistorico, validarAta } from './historico';

describe('anoDoResultado', () => {
  it('usa o ano gravado e, sem ele, o ano do fechamento', () => {
    expect(anoDoResultado({ ano_letivo: '2026' })).toBe('2026');
    expect(anoDoResultado({ fechado_em: '2025-12-10T12:00:00Z' })).toBe('2025');
    expect(anoDoResultado({})).toBe('Sem ano');
  });
});

describe('montarHistorico', () => {
  it('agrupa por aluno e ordena os anos do mais recente ao mais antigo', () => {
    const h = montarHistorico([
      { id: '1', student_id: 'a', ano_letivo: '2025', turma_nome: '4º A', situacao: 'aprovado', frequencia: '92.5' },
      { id: '2', student_id: 'a', ano_letivo: '2026', turma_nome: '5º A', situacao: 'recuperacao', frequencia: null },
      { id: '3', student_id: 'b', ano_letivo: '2026', situacao: 'aprovado' },
    ]);
    expect(h).toHaveLength(2);
    const a = h.find(x => x.studentId === 'a');
    expect(a.anos.map(x => x.ano)).toEqual(['2026', '2025']);
    expect(a.anos[1].frequencia).toBe(92.5);
    expect(a.anos[0].frequencia).toBeNull();
  });

  it('lista vazia ou indefinida não quebra', () => {
    expect(montarHistorico([])).toEqual([]);
    expect(montarHistorico(undefined)).toEqual([]);
  });
});

describe('validarAta', () => {
  it('exige data e algum conteúdo', () => {
    expect(validarAta({ data_reuniao: '', pauta: 'x' })).not.toBe('');
    expect(validarAta({ data_reuniao: '2026-10-30', pauta: '  ' })).not.toBe('');
    expect(validarAta({ data_reuniao: '2026-10-30', deliberacoes: 'ok' })).toBe('');
  });
});
