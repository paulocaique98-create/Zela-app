import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Plano de aula (item 2 do PLANO_EXPANSAO_GESTAO). Migration 20261108120000_plano_aula.
// Cobre Montessori (turma em texto) e Tradicional (atribuicao_id). Roda contra o banco local.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const ok = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
const base = (schoolId, teacherId, extra = {}) => ({
  school_id: schoolId, teacher_id: teacherId, turma: 'Nido',
  periodo_inicio: '2026-11-02', periodo_fim: '2026-11-06', objetivos: 'Objetivo', ...extra,
});

runIf('Plano de aula (RLS, transições e métodos)', () => {
  let escolaA; let escolaB; let profM; let profM2; let profT; let profB; let gestao; let coord; let gestaoB; let recepcao; let familia;
  let atribId; let atribOutraId;

  beforeAll(async () => {
    escolaA = await createTestSchool('Vitest Plano A');
    escolaB = await createTestSchool('Vitest Plano B');
    const prof = (schoolId, turmas) => createTestUser({ role: 'teacher', schoolId, extra: { teacher_status: 'ativo', turmas } });
    profM = await prof(escolaA, ['Nido']);
    profM2 = await prof(escolaA, ['Kids']);
    profT = await prof(escolaA, []);
    profB = await prof(escolaB, ['Nido']);
    gestao = await createTestUser({ role: 'gestao', schoolId: escolaA });
    coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: escolaA });
    gestaoB = await createTestUser({ role: 'gestao', schoolId: escolaB });
    recepcao = await createTestUser({ role: 'admin', schoolId: escolaA });
    familia = await createTestUser({ role: 'family', schoolId: escolaA });

    const aberto = await ok(adminClient.from('school_years').select('id').eq('school_id', escolaA).eq('status', 'aberto').limit(1).maybeSingle());
    const ano = aberto ?? await ok(adminClient.from('school_years')
      .insert({ school_id: escolaA, name: 'Vitest Plano', starts_on: '2026-01-01', ends_on: '2026-12-31', status: 'aberto' }).select('id').single());
    const seg = await ok(adminClient.from('trad_segmentos').insert({ school_id: escolaA, nome: 'Fundamental' }).select('id').single());
    const serie = await ok(adminClient.from('trad_series').insert({ school_id: escolaA, segmento_id: seg.id, nome: '1º ano' }).select('id').single());
    const turma = await ok(adminClient.from('trad_turmas').insert({ school_id: escolaA, school_year_id: ano.id, serie_id: serie.id, nome: '1A' }).select('id').single());
    const d1 = await ok(adminClient.from('trad_disciplinas').insert({ school_id: escolaA, nome: 'Matemática' }).select('id').single());
    const d2 = await ok(adminClient.from('trad_disciplinas').insert({ school_id: escolaA, nome: 'História' }).select('id').single());
    atribId = (await ok(adminClient.from('trad_atribuicoes')
      .insert({ school_id: escolaA, turma_id: turma.id, disciplina_id: d1.id, professor_id: profT.id }).select('id').single())).id;
    atribOutraId = (await ok(adminClient.from('trad_atribuicoes')
      .insert({ school_id: escolaA, turma_id: turma.id, disciplina_id: d2.id, professor_id: profM2.id }).select('id').single())).id;
  });

  afterAll(async () => {
    await adminClient.from('lesson_plans').delete().in('school_id', [escolaA, escolaB]);
    await adminClient.from('trad_atribuicoes').delete().eq('school_id', escolaA);
    await adminClient.from('trad_turmas').delete().eq('school_id', escolaA);
    await adminClient.from('trad_series').delete().eq('school_id', escolaA);
    await adminClient.from('trad_segmentos').delete().eq('school_id', escolaA);
    await adminClient.from('trad_disciplinas').delete().eq('school_id', escolaA);
    await adminClient.from('school_years').delete().eq('school_id', escolaA);
    for (const u of [profM, profM2, profT, profB, gestao, coord, gestaoB, recepcao, familia]) if (u) await deleteTestUser(u.id);
    if (escolaA) await deleteTestSchool(escolaA);
    if (escolaB) await deleteTestSchool(escolaB);
  });

  const criar = (u, extra) => u.client.from('lesson_plans').insert(base(u.schoolId ?? escolaA, u.id, extra)).select('id, status').single();

  it('Montessori: professora cria rascunho da própria turma', async () => {
    const { data, error } = await criar({ ...profM, schoolId: escolaA });
    expect(error).toBeNull();
    expect(data.status).toBe('rascunho');
  });

  it('Montessori: NÃO cria para turma que não é dela', async () => {
    const { error } = await profM.client.from('lesson_plans').insert(base(escolaA, profM.id, { turma: 'Kids' }));
    expect(error).not.toBeNull();
  });

  it('NÃO cria em nome de outra professora nem em outra escola', async () => {
    const { error: e1 } = await profM.client.from('lesson_plans').insert(base(escolaA, profM2.id));
    expect(e1).not.toBeNull();
    const { error: e2 } = await profM.client.from('lesson_plans').insert(base(escolaB, profM.id));
    expect(e2).not.toBeNull();
  });

  it('NÃO nasce já aprovado', async () => {
    const { error } = await profM.client.from('lesson_plans').insert(base(escolaA, profM.id, { status: 'aprovado' }));
    expect(error).not.toBeNull();
  });

  it('Tradicional: cria com a própria atribuição e NÃO com a de outra professora', async () => {
    const { data, error } = await profT.client.from('lesson_plans')
      .insert(base(escolaA, profT.id, { turma: '1A', atribuicao_id: atribId })).select('id').single();
    expect(error).toBeNull();
    expect(data.id).toBeTruthy();
    const { error: e2 } = await profT.client.from('lesson_plans')
      .insert(base(escolaA, profT.id, { turma: '1A', atribuicao_id: atribOutraId }));
    expect(e2).not.toBeNull();
  });

  it('Professora de outra turma, de outra escola, Recepção e Família não enxergam', async () => {
    for (const u of [profM2, profB, recepcao, familia, gestaoB]) {
      const { data } = await u.client.from('lesson_plans').select('id').eq('school_id', escolaA);
      expect(data ?? []).toHaveLength(0);
    }
  });

  describe('fluxo de revisão', () => {
    let planoId;
    beforeAll(async () => {
      planoId = (await ok(adminClient.from('lesson_plans').insert(base(escolaA, profM.id, { conteudo: 'Original' })).select('id').single())).id;
    });
    const upd = (u, patch) => u.client.from('lesson_plans').update(patch).eq('id', planoId).select('status, comentario_coordenacao, revisado_por');

    it('Coordenação NÃO revisa o que ainda é rascunho', async () => {
      const { data } = await upd(coord, { status: 'aprovado' });
      expect(data ?? []).toHaveLength(0);
    });

    it('Professora envia e já não consegue editar', async () => {
      const { data, error } = await upd(profM, { status: 'enviado' });
      expect(error).toBeNull();
      expect(data[0].status).toBe('enviado');
      const { data: depois } = await upd(profM, { conteudo: 'Mudei' });
      expect(depois ?? []).toHaveLength(0);
    });

    it('Professora NÃO escreve nos campos da revisão ao enviar', async () => {
      const { data: fresh } = await adminClient.from('lesson_plans').select('comentario_coordenacao, revisado_por').eq('id', planoId).single();
      expect(fresh.revisado_por).toBeNull();
    });

    it('Coordenação NÃO altera o conteúdo; Recepção e outra escola NÃO revisam', async () => {
      const { error } = await upd(coord, { status: 'aprovado', conteudo: 'Trocado' });
      expect(error).not.toBeNull();
      for (const u of [recepcao, gestaoB, profM2]) {
        const { data } = await upd(u, { status: 'aprovado' });
        expect(data ?? []).toHaveLength(0);
      }
    });

    it('Devolver exige comentário', async () => {
      const { error } = await upd(coord, { status: 'devolvido' });
      expect(error).not.toBeNull();
    });

    it('Coordenação devolve com comentário e o servidor carimba o revisor', async () => {
      const { data, error } = await upd(coord, { status: 'devolvido', comentario_coordenacao: 'Detalhar objetivos', revisado_por: gestao.id });
      expect(error).toBeNull();
      expect(data[0].status).toBe('devolvido');
      expect(data[0].revisado_por).toBe(coord.id);
    });

    it('Professora edita o devolvido, reenvia, e a Gestão aprova', async () => {
      const { error } = await upd(profM, { conteudo: 'Corrigido', status: 'enviado' });
      expect(error).toBeNull();
      const { data, error: e2 } = await upd(gestao, { status: 'aprovado' });
      expect(e2).toBeNull();
      expect(data[0].status).toBe('aprovado');
      expect(data[0].revisado_por).toBe(gestao.id);
    });

    it('Aprovado não é apagado nem editado pela professora', async () => {
      const { data } = await profM.client.from('lesson_plans').delete().eq('id', planoId).select('id');
      expect(data ?? []).toHaveLength(0);
      const { data: ed } = await upd(profM, { conteudo: 'Tarde demais' });
      expect(ed ?? []).toHaveLength(0);
    });

    it('Professora apaga o próprio rascunho', async () => {
      const novo = await ok(adminClient.from('lesson_plans').insert(base(escolaA, profM.id)).select('id').single());
      const { data } = await profM.client.from('lesson_plans').delete().eq('id', novo.id).select('id');
      expect(data).toHaveLength(1);
    });
  });
});
