import { describe, it, expect } from 'vitest';
import { idadeEmMeses, formatIdade, nivelDaTurma, perfilDasTurmas, sugerirTurma, sugestoesDaEscola } from './sugestaoTurma';

const HOJE = new Date(2026, 8, 28);
// Data de nascimento para uma idade em meses, contada a partir de HOJE.
const nasc = (meses) => {
  const d = new Date(2026, 8 - meses, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
let seq = 0;
const aluno = (turma, meses, extra = {}) => ({ id: `s${seq++}`, name: `Aluno ${seq}`, turma, turno: 'Manhã', birth_date: nasc(meses), enrollment_status: 'ativo', ...extra });

// Escola parecida com a real: Nido ~14m, Kids I ~27m (manhã e tarde), Kids II ~50m.
const escola = [
  aluno('Nido', 10), aluno('Nido', 14), aluno('Nido', 16),
  aluno('Kids I Manhã', 22), aluno('Kids I Manhã', 26), aluno('Kids I Manhã', 30),
  aluno('Kids I Tarde', 23, { turno: 'Tarde' }), aluno('Kids I Tarde', 28, { turno: 'Tarde' }), aluno('Kids I Tarde', 31, { turno: 'Tarde' }),
  aluno('Kids II', 44), aluno('Kids II', 50), aluno('Kids II', 56),
];

describe('idade', () => {
  it('conta meses completos', () => {
    expect(idadeEmMeses('2024-09-28', HOJE)).toBe(24);
    expect(idadeEmMeses('2024-09-29', HOJE)).toBe(23);
    expect(idadeEmMeses(null, HOJE)).toBeNull();
  });

  it('escreve a idade como a escola fala', () => {
    expect(formatIdade(0)).toBe('0 anos e 0 meses');
    expect(formatIdade(6)).toBe('0 anos e 6 meses');
    expect(formatIdade(11)).toBe('0 anos e 11 meses');
    expect(formatIdade(1)).toBe('0 anos e 1 mês');
    expect(formatIdade(18)).toBe('1 ano e 6 meses');
    expect(formatIdade(24)).toBe('2 anos e 0 meses');
    expect(formatIdade(null)).toBe('idade não informada');
    expect(formatIdade(27)).toBe('2 anos e 3 meses');
    expect(formatIdade(13)).toBe('1 ano e 1 mês');
  });
});

describe('sugestão de turma (prévia, só pela idade)', () => {
  it('nível é o nome da turma sem o turno', () => {
    expect(nivelDaTurma('Kids I - Matutino')).toBe('kids i');
    expect(nivelDaTurma('Kids II Frutos- Vespertino')).toBe('kids ii frutos');
    expect(nivelDaTurma('Kids II Flores · Manhã')).toBe('kids ii flores');
    expect(nivelDaTurma('Nido')).toBe('nido');
  });

  it('idade típica por nível ignora níveis com menos de 3 crianças e alunos que saíram', () => {
    const { niveis } = perfilDasTurmas([...escola, aluno('Nova', 30), aluno('Kids II', 99, { enrollment_status: 'transferido' })], HOJE);
    expect(niveis.has('nova')).toBe(false);
    expect(niveis.get('nido').mediana).toBe(14);
    expect(niveis.get('kids ii').mediana).toBe(50);
    expect(niveis.get('kids i').turmas.map(t => t.turma)).toEqual(['Kids I Manhã', 'Kids I Tarde']);
  });

  it('mesma turma em turnos com idades bem diferentes continua sendo um nível só (caso real)', () => {
    // Flores de manhã ~43 meses e de tarde ~52: não pode sugerir trocar de turno.
    const real = [
      aluno('Kids II Flores - Matutino', 40, { turno: 'Matutino' }), aluno('Kids II Flores - Matutino', 43, { turno: 'Matutino' }), aluno('Kids II Flores - Matutino', 46, { turno: 'Matutino' }),
      aluno('Kids II Flores - Vespertino', 50, { turno: 'Vespertino' }), aluno('Kids II Flores - Vespertino', 52, { turno: 'Vespertino' }), aluno('Kids II Flores - Vespertino', 55, { turno: 'Vespertino' }),
      aluno('Kids II Frutos - Matutino', 60, { turno: 'Matutino' }), aluno('Kids II Frutos - Matutino', 64, { turno: 'Matutino' }),
      aluno('Kids II Frutos- Vespertino', 66, { turno: 'Vespertino' }), aluno('Kids II Frutos- Vespertino', 70, { turno: 'Vespertino' }),
    ];
    const perfis = perfilDasTurmas(real, HOJE);
    expect(sugerirTurma(aluno('Kids II Flores - Matutino', 50, { turno: 'Matutino' }), perfis, HOJE)).toBeNull();
    expect(sugerirTurma(aluno('Kids II Flores - Matutino', 69, { turno: 'Matutino' }), perfis, HOJE)).toMatchObject({ tipo: 'evoluir', turma: 'Kids II Frutos - Matutino' });
  });

  it('criança do Nido com idade de Kids I: sugere o Kids I do mesmo turno', () => {
    const perfis = perfilDasTurmas(escola, HOJE);
    expect(sugerirTurma(aluno('Nido', 25), perfis, HOJE)).toMatchObject({ tipo: 'evoluir', turma: 'Kids I Manhã', idadeMeses: 25 });
    expect(sugerirTurma(aluno('Nido', 26, { turno: 'Tarde' }), perfis, HOJE)).toMatchObject({ tipo: 'evoluir', turma: 'Kids I Tarde' });
  });

  it('manhã e tarde da mesma turma são o mesmo nível: não sugere trocar entre elas', () => {
    const perfis = perfilDasTurmas(escola, HOJE);
    expect(sugerirTurma(aluno('Kids I Manhã', 31), perfis, HOJE)).toBeNull();
  });

  it('não sugere quem ainda é novo para a turma seguinte, nem quem está na última turma', () => {
    const perfis = perfilDasTurmas(escola, HOJE);
    expect(sugerirTurma(aluno('Nido', 15), perfis, HOJE)).toBeNull();
    expect(sugerirTurma(aluno('Kids II', 70), perfis, HOJE)).toBeNull();
  });

  it('criança muito mais nova que a turma: pede para conferir o cadastro', () => {
    const perfis = perfilDasTurmas(escola, HOJE);
    expect(sugerirTurma(aluno('Kids II', 11), perfis, HOJE)).toMatchObject({ tipo: 'conferir', idadeMeses: 11 });
  });

  it('lista da escola: evoluir primeiro (mais velhos antes), depois conferir', () => {
    const lista = sugestoesDaEscola([...escola, aluno('Nido', 24), aluno('Nido', 27), aluno('Kids II', 12)], HOJE);
    expect(lista.map(s => [s.tipo, s.idadeMeses])).toEqual([['evoluir', 27], ['evoluir', 24], ['conferir', 12]]);
    expect(lista[0]).toMatchObject({ turmaAtual: 'Nido', turma: 'Kids I Manhã' });
  });
});
