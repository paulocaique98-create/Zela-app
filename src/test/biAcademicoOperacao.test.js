import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Painel de indicadores (PLANO_EXPANSAO_GESTAO.md, Fase 1.5): bi_academico e bi_operacao.
// Gestão e Coordenação leem; Recepção, Família e anônimo são barrados; outra escola enxerga zero;
// o bloco do método da escola é o único devolvido.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const INICIO = '2026-09-01';
const FIM = '2026-09-30';
const NEGADO = '42501';

async function ok(promise) {
  const r = await promise;
  if (r.error) throw r.error;
  return r.data;
}

async function montaCenario() {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const professora = await createTestUser({ role: 'teacher', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });

  await ok(adminClient.from('schools').update({ pedagogical_method: 'tradicional' }).eq('id', schoolA));
  const aluno = await ok(adminClient.from('students')
    .insert({ school_id: schoolA, name: 'Vitest Aluno Acad', turma: 'Turma BI', family_id: familia.id }).select('id').single());

  // Estrutura do Tradicional: ano, segmento, série, turma, disciplina, atribuição.
  // A escola de teste já nasce com um ano letivo aberto: reaproveita e ajusta as datas.
  const aberto = await ok(adminClient.from('school_years').select('id').eq('school_id', schoolA).eq('status', 'aberto').limit(1).maybeSingle());
  const ano = aberto
    ? await ok(adminClient.from('school_years').update({ starts_on: '2026-01-01', ends_on: '2026-12-31' }).eq('id', aberto.id).select('id').single())
    : await ok(adminClient.from('school_years')
      .insert({ school_id: schoolA, name: 'Vitest 2026', starts_on: '2026-01-01', ends_on: '2026-12-31', status: 'aberto' }).select('id').single());
  const seg = await ok(adminClient.from('trad_segmentos').insert({ school_id: schoolA, nome: 'Fundamental' }).select('id').single());
  const serie = await ok(adminClient.from('trad_series').insert({ school_id: schoolA, segmento_id: seg.id, nome: '1º ano' }).select('id').single());
  const turma = await ok(adminClient.from('trad_turmas')
    .insert({ school_id: schoolA, school_year_id: ano.id, serie_id: serie.id, nome: 'Turma BI' }).select('id').single());
  const disc = await ok(adminClient.from('trad_disciplinas').insert({ school_id: schoolA, nome: 'Matemática' }).select('id').single());
  const atrib = await ok(adminClient.from('trad_atribuicoes')
    .insert({ school_id: schoolA, turma_id: turma.id, disciplina_id: disc.id, professor_id: professora.id }).select('id').single());
  const avs = await ok(adminClient.from('trad_avaliacoes').insert([
    { school_id: schoolA, atribuicao_id: atrib.id, periodo: 1, nome: 'Prova', tipo: 'prova', peso: 1 },
    { school_id: schoolA, atribuicao_id: atrib.id, periodo: 1, nome: 'Trabalho', tipo: 'trabalho', peso: 3 },
  ]).select('id, nome'));
  const prova = avs.find((a) => a.nome === 'Prova').id;
  const trabalho = avs.find((a) => a.nome === 'Trabalho').id;
  await ok(adminClient.from('trad_notas').insert([
    { school_id: schoolA, avaliacao_id: prova, student_id: aluno.id, nota: 8 },
    { school_id: schoolA, avaliacao_id: trabalho, student_id: aluno.id, nota: 4 },
  ]));

  // Presença: uma entrada às 08h e uma saída às 17h (São Paulo) e uma correção pendente.
  const logs = await ok(adminClient.from('attendance_logs').insert([
    { school_id: schoolA, student_id: aluno.id, family_id: familia.id, event_type: 'entry', event_time: '2026-09-10T11:00:00Z' },
    { school_id: schoolA, student_id: aluno.id, family_id: familia.id, event_type: 'exit', event_time: '2026-09-10T20:00:00Z' },
  ]).select('id, event_type'));
  const saida = logs.find((l) => l.event_type === 'exit');
  await ok(adminClient.from('attendance_corrections').insert({
    school_id: schoolA, attendance_log_id: saida.id, student_id: aluno.id, event_type: 'exit',
    original_event_time: '2026-09-10T20:00:00Z', new_event_time: '2026-09-10T19:00:00Z',
    reason_code: 'outro', requested_by: gestao.id, status: 'pending', requested_at: '2026-09-10T21:00:00Z',
  }));

  const limpar = async () => {
    await adminClient.from('attendance_corrections').delete().eq('school_id', schoolA);
    await adminClient.from('attendance_logs').delete().eq('school_id', schoolA);
    await adminClient.from('reports').delete().eq('school_id', schoolA);
    await adminClient.from('trad_atribuicoes').delete().eq('school_id', schoolA);
    await adminClient.from('trad_turmas').delete().eq('school_id', schoolA);
    await adminClient.from('trad_series').delete().eq('school_id', schoolA);
    await adminClient.from('trad_segmentos').delete().eq('school_id', schoolA);
    await adminClient.from('trad_disciplinas').delete().eq('school_id', schoolA);
    await adminClient.from('school_years').delete().eq('school_id', schoolA);
    await adminClient.from('students').delete().eq('school_id', schoolA);
    for (const u of [gestao, coord, recepcao, familia, professora, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, gestao, coord, recepcao, familia, professora, gestaoB, aluno, avaliacoes: { prova, trabalho }, atrib, limpar };
}

runIf('Painel de indicadores · bi_academico e bi_operacao', () => {
  it('Tradicional: média ponderada, recuperação substitui e só o bloco do método volta', async () => {
    const c = await montaCenario();
    try {
      const { data: a, error } = await c.gestao.client.rpc('bi_academico', { p_inicio: INICIO, p_fim: FIM });
      expect(error).toBeNull();
      expect(a.metodo).toBe('tradicional');
      expect(a.montessori).toBeNull();
      // (8*1 + 4*3) / 4 = 5,0 < 7,0
      expect(a.tradicional.media_por_disciplina[0]).toMatchObject({ disciplina: 'Matemática', media: 5 });
      expect(a.tradicional.kpis.alunos_abaixo_media).toBe(1);
      expect(a.tradicional.aprovacao_por_serie[0]).toMatchObject({ serie: '1º ano', alunos: 1, aprovados: 0 });
      expect(a.tradicional.abaixo_media_periodo[0]).toMatchObject({ periodo: 1, media: 5 });
      expect(a.tradicional.distribuicao_notas).toHaveLength(10);

      const rec = await ok(adminClient.from('trad_avaliacoes')
        .insert({ school_id: c.schoolA, atribuicao_id: c.atrib.id, periodo: 1, nome: 'Recuperação', tipo: 'recuperacao', peso: 1 }).select('id').single());
      await ok(adminClient.from('trad_notas').insert({ school_id: c.schoolA, avaliacao_id: rec.id, student_id: c.aluno.id, nota: 9 }));
      const { data: b } = await c.gestao.client.rpc('bi_academico', { p_inicio: INICIO, p_fim: FIM });
      expect(b.tradicional.media_por_disciplina[0].media).toBe(9);
      expect(b.tradicional.kpis.alunos_abaixo_media).toBe(0);
      expect(b.tradicional.aprovacao_por_serie[0].aprovados).toBe(1);
    } finally {
      await c.limpar();
    }
  }, 90000);

  it('Montessori: relatórios publicados x pendentes por professora, sem bloco Tradicional', async () => {
    const c = await montaCenario();
    try {
      await ok(adminClient.from('schools').update({ pedagogical_method: 'montessori' }).eq('id', c.schoolA));
      await ok(adminClient.from('reports').insert([
        { school_id: c.schoolA, student_id: c.aluno.id, title: 'Vitest A', author_id: c.professora.id, status: 'PUBLICADO', published_at: new Date().toISOString(), created_at: '2026-09-05T15:00:00Z' },
        { school_id: c.schoolA, student_id: c.aluno.id, title: 'Vitest B', author_id: c.professora.id, status: 'RASCUNHO', created_at: '2026-09-06T15:00:00Z' },
      ]));
      const { data: a, error } = await c.coord.client.rpc('bi_academico', { p_inicio: INICIO, p_fim: FIM });
      expect(error).toBeNull();
      expect(a.tradicional).toBeNull();
      expect(a.montessori.kpis).toMatchObject({ relatorios_publicados: 1, relatorios_pendentes: 1 });
      expect(a.montessori.relatorios_por_professora[0]).toMatchObject({ publicados: 1, pendentes: 1 });
    } finally {
      await c.limpar();
    }
  }, 90000);

  it('Operação: entradas e saídas por hora de São Paulo e correções do período', async () => {
    const c = await montaCenario();
    try {
      for (const u of [c.gestao, c.coord]) {
        const { data: o, error } = await u.client.rpc('bi_operacao', { p_inicio: INICIO, p_fim: FIM });
        expect(error).toBeNull();
        expect(o.kpis).toMatchObject({ entradas: 1, saidas: 1, correcoes_pedidas: 1, correcoes_pendentes: 1, correcoes_aprovadas: 0 });
        expect(o.por_hora).toHaveLength(24);
        expect(o.por_hora[8].entradas).toBe(1);
        expect(o.por_hora[17].saidas).toBe(1);
        expect(JSON.stringify(o)).not.toMatch(/_cents/);
      }
      const { data: outra } = await c.gestao.client.rpc('bi_operacao', { p_inicio: INICIO, p_fim: FIM, p_turmas: ['Outra'] });
      expect(outra.kpis.entradas).toBe(0);
    } finally {
      await c.limpar();
    }
  }, 90000);

  it('Recepção, Família e anônimo barrados; outra escola recebe zeros; período inválido dá erro', async () => {
    const c = await montaCenario();
    try {
      for (const u of [c.recepcao, c.familia]) {
        for (const fn of ['bi_academico', 'bi_operacao']) {
          const { error } = await u.client.rpc(fn, { p_inicio: INICIO, p_fim: FIM });
          expect(error?.code).toBe(NEGADO);
        }
      }
      const anon = createClient(SUPABASE_URL, ANON_KEY);
      expect((await anon.rpc('bi_academico', { p_inicio: INICIO, p_fim: FIM })).error).not.toBeNull();
      expect((await anon.rpc('bi_operacao', { p_inicio: INICIO, p_fim: FIM })).error).not.toBeNull();

      const { data: acadB } = await c.gestaoB.client.rpc('bi_academico', { p_inicio: INICIO, p_fim: FIM });
      expect(acadB.tradicional.kpis.notas_lancadas).toBe(0);
      expect(acadB.tradicional.media_por_disciplina).toEqual([]);
      const { data: opB } = await c.gestaoB.client.rpc('bi_operacao', { p_inicio: INICIO, p_fim: FIM });
      expect(opB.kpis).toMatchObject({ entradas: 0, saidas: 0, correcoes_pedidas: 0 });

      const { error: longo } = await c.gestao.client.rpc('bi_operacao', { p_inicio: '2024-01-01', p_fim: '2026-09-30' });
      expect(longo?.message).toMatch(/bi_periodo_maximo_24_meses/);
      const { error: invertido } = await c.gestao.client.rpc('bi_academico', { p_inicio: FIM, p_fim: INICIO });
      expect(invertido?.message).toMatch(/bi_periodo_invalido/);
    } finally {
      await c.limpar();
    }
  }, 90000);
});
