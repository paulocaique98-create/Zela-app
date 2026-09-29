import { describe, it, expect } from 'vitest';
import { buildPendencias as buildPendenciasGp } from './pendenciasModel';

describe('Pendências · Gestão Pedagógica e contrato de aluno que saiu (29/09/2026)', () => {
  const base = { cadastros: [], matriculas: [], exclusoes: [], biometria: [], vencidas: [], despesas: [], contratos: [], documentos: [] };

  it('mensalidade ativa de aluno que saiu vira pendência financeira da Gestão', () => {
    const { rows } = buildPendenciasGp({ ...base, correcoes: [], contratosAlunoSaiu: [{ id: 'c1', students: { name: 'Laura Nunes', enrollment_status: 'transferido' } }] }, '2026-09-29');
    expect(rows.find(r => r.key === 'contratos-aluno-saiu')).toMatchObject({ area: 'financeiro', tab: 'financeiro-mensalidades', meta: 'Laura Nunes' });
  });

  it('para quem não aprova, correção pendente é só acompanhamento', () => {
    const correcoes = [{ id: 'x', increases_billing: true, students: { name: 'Ana' } }];
    expect(buildPendenciasGp({ ...base, correcoes }, '2026-09-29').rows[0]).toMatchObject({ priority: 'urgente', action: 'Revisar' });
    const r = buildPendenciasGp({ ...base, correcoes }, '2026-09-29', { podeAprovarCorrecoes: false }).rows[0];
    expect(r).toMatchObject({ priority: 'acompanhar', action: 'Acompanhar' });
    expect(r.title).toMatch(/aguardando a Gestão/);
  });
});
import { buildPendencias } from './pendenciasModel';

const TODAY = '2026-09-28';

const empty = {
  cadastros: [], matriculas: [], correcoes: [], vencidas: [], vencidasTotal: 0, contratos: [],
  despesas: [], exclusoes: [], biometria: [], documentos: [],
};

const full = {
  ...empty,
  exclusoes: [{ id: 'e1', user_name: 'Roberta Siqueira', user_role: 'family', requested_at: '2026-09-10T12:00:00Z' }],
  vencidas: [
    { id: 'c1', amount_cents: 200000, due_date: '2026-09-10' },
    { id: 'c2', amount_cents: 225000, due_date: '2026-09-20' },
  ],
  vencidasTotal: 425000,
  correcoes: [{ id: 'k1', increases_billing: true }, { id: 'k2', increases_billing: false }],
  cadastros: [{ id: 'u1', name: 'Mariana Lopes' }, { id: 'u2', name: 'Paulo Nunes' }, { id: 'u3', name: 'Carla Teixeira' }],
  matriculas: [{ id: 'm1', tipo: 'rematricula', criancas: [{ nome: 'Helena Duarte' }] }],
  despesas: [
    { id: 'd1', description: 'Aluguel', amount_cents: 100000, due_date: '2026-10-02' },
    { id: 'd2', description: 'Conta de luz', amount_cents: 38000, due_date: '2026-09-27' },
  ],
  contratos: [{ id: 'x1', sent_at: '2026-09-15T10:00:00Z' }, { id: 'x2', sent_at: '2026-09-27T10:00:00Z' }],
  documentos: Array.from({ length: 65 }, (_, i) => ({ id: `s${i}` })),
  biometria: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
};

describe('buildPendencias · Modelo 4 da tela Pendências', () => {
  it('sem pendências: fila vazia e números zerados', () => {
    const m = buildPendencias(empty, TODAY);
    expect(m.rows).toEqual([]);
    expect(m.areas).toEqual([]);
    expect(m.kpis).toMatchObject({ hoje: 0, semana: 0, atrasoCents: 0, prazo: '·' });
  });

  it('separa por prioridade na ordem Urgente, Esta semana, Acompanhar', () => {
    const m = buildPendencias(full, TODAY);
    const byPriority = (p) => m.rows.filter(r => r.priority === p).map(r => r.key);
    expect(byPriority('urgente')).toEqual(['exclusao-e1', 'vencidas', 'despesas-atrasadas', 'correcoes']);
    expect(byPriority('semana')).toEqual(['despesas', 'cadastros', 'matriculas', 'contratos']);
    expect(byPriority('acompanhar')).toEqual(['biometria', 'documentos']);
    const priorities = m.rows.map(r => r.priority);
    expect(priorities.indexOf('semana')).toBeGreaterThan(priorities.lastIndexOf('urgente'));
  });

  it('textos da fila com os dados reais', () => {
    const m = buildPendencias(full, TODAY);
    const row = (k) => m.rows.find(r => r.key === k);
    expect(row('exclusao-e1').badge).toBe('Faltam 12 dias');
    expect(row('vencidas').title).toContain('2 cobranças vencidas');
    expect(row('vencidas').meta).toBe('A mais antiga venceu há 18 dias');
    expect(row('correcoes').meta).toBe('1 aumenta a cobrança de hora extra');
    expect(row('cadastros').meta).toBe('Mariana Lopes, Paulo Nunes e mais 1');
    expect(row('matriculas').meta).toBe('Helena Duarte (rematrícula)');
    expect(row('contratos').meta).toBe('1 enviado há mais de 7 dias');
    expect(row('documentos').title).toBe('65 alunos com documentos faltando');
    expect(row('despesas-atrasadas').meta).toBe('Conta de luz');
  });

  it('cada linha leva à tela onde se resolve', () => {
    const m = buildPendencias(full, TODAY);
    const tabs = Object.fromEntries(m.rows.map(r => [r.key, r.tab]));
    expect(tabs).toMatchObject({
      'exclusao-e1': 'cadastros-exclusoes', vencidas: 'financeiro-inadimplencia', correcoes: 'attendance-corrections',
      cadastros: 'cadastros-usuarios', matriculas: 'secretaria-matriculas', contratos: 'contratos-assinaturas',
      documentos: 'secretaria-documentos', biometria: 'cadastros-biometria', despesas: 'financeiro-despesas',
    });
  });

  it('números do topo: urgentes, semana, atraso e o prazo mais próximo', () => {
    const m = buildPendencias(full, TODAY);
    expect(m.kpis.hoje).toBe(4);
    expect(m.kpis.semana).toBe(4);
    expect(m.kpis.atrasoCents).toBe(425000);
    expect(m.kpis.atrasoHint).toBe('2 cobranças vencidas');
    // Despesa de 02/10 vence em 4 dias, antes dos 12 dias da exclusão.
    expect(m.kpis.prazo).toBe('4 dias');
    expect(m.kpis.prazoHint).toBe('despesa: Aluguel');
    // Sem repetir a área quando há duas pendências dela.
    expect(m.kpis.hojeHint).toBe('lgpd, financeiro e presença');
    expect(m.kpis.semanaHint).toBe('financeiro, cadastros, secretaria e mais 1');
  });

  it('áreas: só as que têm pendência, a mais grave primeiro', () => {
    const m = buildPendencias(full, TODAY);
    expect(m.areas.map(a => a.key)).toEqual(['lgpd', 'financeiro', 'presenca', 'cadastros', 'secretaria', 'contratos']);
    const lgpd = m.areas.find(a => a.key === 'lgpd');
    expect(lgpd).toMatchObject({ count: 2, worst: 'urgente', resumo: 'exclusão em 12 dias' });
    expect(m.areas.find(a => a.key === 'contratos')).toMatchObject({ count: 1, worst: 'semana' });

    const soDocumentos = buildPendencias({ ...empty, documentos: [{ id: 1 }] }, TODAY);
    expect(soDocumentos.areas).toEqual([expect.objectContaining({ key: 'secretaria', worst: 'acompanhar' })]);
  });

  it('pedido de exclusão com prazo estourado aparece como vencido', () => {
    const m = buildPendencias({ ...empty, exclusoes: [{ id: 'e', user_name: 'X', user_role: 'teacher', requested_at: '2026-08-20' }] }, TODAY);
    expect(m.rows[0].badge).toBe('Prazo vencido há 9 dias');
    expect(m.rows[0].meta).toContain('Professora');
    expect(m.kpis.prazo).toBe('Hoje');
  });
});
