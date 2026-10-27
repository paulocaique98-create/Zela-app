import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { calcularBoletim, situacaoDaDisciplina, situacaoFinal } from './boletim';

const config = { periodo_tipo: 'bimestre', media_minima: 7, freq_minima: 75, media_recuperacao: 5, recuperacao_final: true };

// Uma disciplina, 4 bimestres, uma prova por bimestre.
const montar = (notasPorBimestre, extra = {}) => {
  const avaliacoes = [1, 2, 3, 4].map(p => ({ id: `av${p}`, atribuicao_id: 'at1', periodo: p, tipo: 'prova', peso: 1 }));
  const notas = notasPorBimestre.map((nota, i) => ({ avaliacao_id: `av${i + 1}`, student_id: 's1', nota }));
  const aulas = [{ id: 'a1', qtd_aulas: 4 }];
  const registros = [{ aula_id: 'a1', student_id: 's1', status: extra.status || 'presente' }];
  return calcularBoletim({
    studentId: 's1', atribuicoes: [{ id: 'at1', disciplina: 'Matemática' }],
    avaliacoes, notas, aulas, registros, config: extra.config || config,
  });
};

describe('situacaoDaDisciplina', () => {
  it('aprova na média mínima, recupera entre as duas médias e reprova abaixo', () => {
    expect(situacaoDaDisciplina(7, config)).toBe('aprovado');
    expect(situacaoDaDisciplina(6.9, config)).toBe('recuperacao');
    expect(situacaoDaDisciplina(5, config)).toBe('recuperacao');
    expect(situacaoDaDisciplina(4.9, config)).toBe('reprovado');
    expect(situacaoDaDisciplina(null, config)).toBe('sem_nota');
  });

  it('escola sem recuperação final reprova direto abaixo da média mínima', () => {
    expect(situacaoDaDisciplina(6, { ...config, recuperacao_final: false })).toBe('reprovado');
    expect(situacaoDaDisciplina(6, { ...config, media_recuperacao: null })).toBe('reprovado');
  });

  it('respeita a média mínima personalizada', () => {
    expect(situacaoDaDisciplina(6, { ...config, media_minima: 6 })).toBe('aprovado');
  });
});

describe('calcularBoletim', () => {
  it('aprova com média e frequência acima do mínimo', () => {
    const b = montar([8, 7, 9, 8]);
    expect(b.linhas[0].media_anual).toBe(8);
    expect(b.frequencia).toBe(100);
    expect(b.situacao).toBe('aprovado');
  });

  it('manda para recuperação final com média entre 5 e 7', () => {
    expect(montar([6, 6, 6, 6]).situacao).toBe('recuperacao');
  });

  it('reprova com média abaixo da recuperação', () => {
    expect(montar([3, 4, 4, 3]).situacao).toBe('reprovado');
  });

  it('reprova por frequência mesmo com boas notas', () => {
    expect(montar([9, 9, 9, 9], { status: 'falta' }).situacao).toBe('reprovado_frequencia');
  });

  it('usa a frequência mínima da escola', () => {
    const aulas = [{ id: 'a1', qtd_aulas: 1 }, { id: 'a2', qtd_aulas: 1 }];
    const registros = [
      { aula_id: 'a1', student_id: 's1', status: 'presente' },
      { aula_id: 'a2', student_id: 's1', status: 'falta' },
    ];
    const base = {
      studentId: 's1', atribuicoes: [{ id: 'at1', disciplina: 'Matemática' }], aulas, registros,
      avaliacoes: [1, 2, 3, 4].map(p => ({ id: `av${p}`, atribuicao_id: 'at1', periodo: p, tipo: 'prova', peso: 1 })),
      notas: [1, 2, 3, 4].map(p => ({ avaliacao_id: `av${p}`, student_id: 's1', nota: 9 })),
    };
    expect(calcularBoletim({ ...base, config: { ...config, freq_minima: 50 } }).situacao).toBe('aprovado');
    expect(calcularBoletim({ ...base, config }).situacao).toBe('reprovado_frequencia');
  });

  it('fica incompleto quando falta nota de algum período', () => {
    expect(montar([8, 8]).situacao).toBe('incompleto');
  });

  it('fica incompleto sem frequência registrada ou sem disciplinas', () => {
    expect(situacaoFinal({ linhas: [], frequencia: 100, incompleto: true, config })).toBe('incompleto');
    expect(situacaoFinal({ linhas: [{ situacao: 'aprovado' }], frequencia: null, incompleto: false, config })).toBe('incompleto');
  });

  it('ignora notas de outro aluno', () => {
    const b = calcularBoletim({
      studentId: 's2', atribuicoes: [{ id: 'at1', disciplina: 'Matemática' }],
      avaliacoes: [{ id: 'av1', atribuicao_id: 'at1', periodo: 1, tipo: 'prova', peso: 1 }],
      notas: [{ avaliacao_id: 'av1', student_id: 's1', nota: 10 }], aulas: [], registros: [], config,
    });
    expect(b.linhas[0].media_anual).toBe(null);
  });
});
