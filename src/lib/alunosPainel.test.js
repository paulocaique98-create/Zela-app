import { describe, it, expect } from 'vitest';
import { motivosDeAtencao, tomDaAtencao, resumoDosMotivos, buildPainelAlunos, SEM_TURMA } from './alunosPainel';

const todosDocs = ['certidao_nascimento', 'cartao_vacina', 'comprovante_residencia'];
const docsDe = (id, cats = todosDocs) => cats.map(category => ({ student_id: id, category }));

describe('motivosDeAtencao · Secretaria > Alunos', () => {
  it('aluno ativo com tudo em dia não precisa de atenção', () => {
    expect(motivosDeAtencao({ enrollmentStatus: 'ativo', documentCategories: todosDocs, hasFichaMedica: true })).toEqual([]);
  });

  it('um documento faltando aponta qual é', () => {
    const [m] = motivosDeAtencao({ documentCategories: ['certidao_nascimento', 'comprovante_residencia', 'rg'], hasFichaMedica: true });
    expect(m).toMatchObject({ key: 'documentos', tone: 'warn', text: 'Falta cartão de vacina' });
  });

  it('vários documentos faltando viram um motivo só, com a lista', () => {
    const [m] = motivosDeAtencao({ documentCategories: [], hasFichaMedica: true });
    expect(m.text).toBe('Faltam 3 documentos');
    expect(m.detail).toBe('Certidão de Nascimento, Cartão de Vacina, Comprovante de Residência');
  });

  it('sem ficha médica e com cobrança em atraso: cada um com seu tom', () => {
    const ms = motivosDeAtencao({ documentCategories: todosDocs, hasFichaMedica: false, overdueCount: 2, overdueCents: 290000 });
    expect(ms.map(m => [m.key, m.tone])).toEqual([['ficha', 'warn'], ['financeiro', 'bad']]);
    expect(ms[1].text).toBe('2 cobranças em atraso');
    // Intl usa um espaço especial entre "R$" e o número.
    expect(ms[1].detail.replace(/\s/g, ' ')).toBe('R$ 2.900,00');
    expect(tomDaAtencao(ms)).toBe('bad');
    expect(resumoDosMotivos(ms)).toBe('2 cobranças em atraso +1');
  });

  it('alunos que saíram (transferido, inativo, cancelado) não entram em atenção', () => {
    for (const s of ['transferido', 'inativo', 'cancelado']) {
      expect(motivosDeAtencao({ enrollmentStatus: s, documentCategories: [], hasFichaMedica: false, overdueCount: 1 })).toEqual([]);
    }
  });

  it('tom e resumo de quem está em dia', () => {
    expect(tomDaAtencao([])).toBeNull();
    expect(tomDaAtencao([{ tone: 'warn' }])).toBe('warn');
    expect(resumoDosMotivos([])).toBe('em dia');
    expect(resumoDosMotivos([{ tone: 'warn', text: 'Sem ficha médica' }])).toBe('sem ficha médica');
  });
});

describe('buildPainelAlunos · painel por turma', () => {
  const students = [
    { id: 'a', name: 'Theo Ramos', turma: 'Nido', turno: 'Manhã', enrollment_status: 'ativo' },
    { id: 'b', name: 'Gabriel Siqueira', turma: 'Nido', turno: 'Integral', enrollment_status: 'ativo' },
    { id: 'c', name: 'Lucas Prado', turma: 'Fundamental I', turno: 'Manhã', enrollment_status: 'ativo' },
    { id: 'd', name: 'Ana Moura', turma: 'Fundamental I', turno: 'Tarde', enrollment_status: 'ativo' },
    { id: 'e', name: 'Bia Sem Turma', turma: null, turno: null, enrollment_status: 'ativo' },
    { id: 'f', name: 'Laura Nunes', turma: 'Nido', turno: 'Manhã', enrollment_status: 'transferido' },
  ];
  const base = {
    students,
    documentos: [...docsDe('a'), ...docsDe('b'), ...docsDe('c'), ...docsDe('d', ['rg']), ...docsDe('e')],
    fichaStudentIds: ['b', 'c', 'd', 'e'],
    overdueCharges: [{ student_id: 'c', amount_cents: 100000 }, { student_id: 'c', amount_cents: 50000 }],
    turmasConfig: ['Nido', 'Comunidade Infantil', 'Fundamental I'],
  };

  it('turmas na ordem da escola, só as que têm alunos ativos, e "Sem turma" por último', () => {
    const { turmas, kpis } = buildPainelAlunos(base);
    expect(turmas.map(t => t.nome)).toEqual(['Nido', 'Fundamental I', SEM_TURMA]);
    expect(kpis).toMatchObject({ ativos: 5, turmas: 3, atencao: 3 });
  });

  it('cartão da turma: total, turnos, atenção primeiro (vermelho antes do âmbar)', () => {
    const { turmas } = buildPainelAlunos(base);
    const nido = turmas[0];
    expect(nido).toMatchObject({ total: 2, emDia: 1, tone: 'warn' });
    expect(nido.turnos).toEqual([{ turno: 'Manhã', total: 1 }, { turno: 'Integral', total: 1 }]);
    expect(nido.destaque.map(l => [l.name, l.resumo])).toEqual([['Theo Ramos', 'sem ficha médica'], ['Gabriel Siqueira', 'em dia']]);

    const fund = turmas[1];
    expect(fund.tone).toBe('bad');
    expect(fund.atencao.map(l => l.name)).toEqual(['Lucas Prado', 'Ana Moura']);
  });

  it('conta os motivos por tipo para o cartão "Precisam de atenção"', () => {
    const { atencaoPorTipo, atencaoIds } = buildPainelAlunos(base);
    expect(atencaoPorTipo).toEqual({ documentos: 1, ficha: 1, financeiro: 1 });
    expect(atencaoIds.sort()).toEqual(['a', 'c', 'd']);
  });

  it('entradas ignoram a carga inicial do ano; saídas listam quem saiu, mais recente primeiro', () => {
    const anoLetivo = { created_at: '2026-09-27T12:00:00Z' };
    const enrollments = [
      { student_id: 'a', created_at: '2026-09-27T12:00:01Z', updated_at: '2026-09-27T12:00:01Z' },
      { student_id: 'b', created_at: '2026-09-27T12:00:01Z', updated_at: '2026-09-27T12:00:01Z' },
      { student_id: 'e', created_at: '2026-09-28T09:00:00Z', updated_at: '2026-09-28T09:00:00Z' },
      { student_id: 'f', created_at: '2026-09-27T12:00:01Z', updated_at: '2026-09-28T10:00:00Z' },
    ];
    const r = buildPainelAlunos({ ...base, anoLetivo, enrollments, saidasExternas: [{ student_id: 'f', transferred_at: '2026-09-28T08:00:00Z' }] });
    expect(r.kpis.entradas).toBe(1);
    expect(r.kpis.saidas).toBe(1);
    expect(r.saidas[0]).toMatchObject({ name: 'Laura Nunes', status: 'transferido', em: '2026-09-28T08:00:00Z' });
    expect(r.saidasPorStatus).toEqual({ transferido: 1 });
  });

  it('sem ano letivo aberto, entradas e saídas ficam zeradas', () => {
    const r = buildPainelAlunos({ ...base, enrollments: [{ student_id: 'f', created_at: '2026-09-28T00:00:00Z' }] });
    expect(r.kpis.entradas).toBe(0);
    expect(r.saidas).toEqual([]);
  });
});
