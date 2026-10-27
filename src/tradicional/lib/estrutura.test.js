import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { disciplinasSemProfessor, professorOcupado, mensagemDeErro, listar } from './estrutura';

describe('disciplinasSemProfessor', () => {
  const turma = { id: 't1', serie_id: 's1' };
  const grade = [
    { serie_id: 's1', disciplina_id: 'd1' },
    { serie_id: 's1', disciplina_id: 'd2' },
    { serie_id: 's2', disciplina_id: 'd3' },
  ];

  it('lista só as disciplinas da série da turma sem professor', () => {
    const atribuicoes = [{ turma_id: 't1', disciplina_id: 'd1', professor_id: 'p1' }];
    expect(disciplinasSemProfessor({ turma, grade, atribuicoes })).toEqual(['d2']);
  });

  it('ignora atribuições de outras turmas', () => {
    const atribuicoes = [{ turma_id: 't9', disciplina_id: 'd1', professor_id: 'p1' }];
    expect(disciplinasSemProfessor({ turma, grade, atribuicoes })).toEqual(['d1', 'd2']);
  });

  it('sem turma devolve vazio', () => {
    expect(disciplinasSemProfessor({ turma: null, grade, atribuicoes: [] })).toEqual([]);
  });
});

describe('professorOcupado', () => {
  const atribuicoes = [
    { id: 'a1', professor_id: 'p1' },
    { id: 'a2', professor_id: 'p2' },
  ];
  const horarios = [{ id: 'h1', atribuicao_id: 'a1', dia_semana: 1, ordem: 2 }];

  it('detecta o mesmo professor no mesmo dia e horário', () => {
    expect(professorOcupado({ horarios, atribuicoes, professorId: 'p1', dia: 1, ordem: 2 })).toBe(true);
  });

  it('não acusa outro professor, outro dia ou outro horário', () => {
    expect(professorOcupado({ horarios, atribuicoes, professorId: 'p2', dia: 1, ordem: 2 })).toBe(false);
    expect(professorOcupado({ horarios, atribuicoes, professorId: 'p1', dia: 2, ordem: 2 })).toBe(false);
    expect(professorOcupado({ horarios, atribuicoes, professorId: 'p1', dia: 1, ordem: 3 })).toBe(false);
  });

  it('permite ignorar o próprio horário ao editar', () => {
    expect(professorOcupado({ horarios, atribuicoes, professorId: 'p1', dia: 1, ordem: 2, ignorarHorarioId: 'h1' })).toBe(false);
  });
});

describe('mensagemDeErro e listar', () => {
  it('traduz códigos conhecidos', () => {
    expect(mensagemDeErro({ code: '23505' })).toMatch(/Já existe/);
    expect(mensagemDeErro({ code: '23503' })).toMatch(/em uso/);
    expect(mensagemDeErro({ code: '42501' })).toMatch(/permissão/);
  });

  it('listar sem escola ou com tabela fora da lista não consulta nada', async () => {
    expect(await listar('trad_series', null)).toEqual([]);
    expect(await listar('users', 'x')).toEqual([]);
  });
});
