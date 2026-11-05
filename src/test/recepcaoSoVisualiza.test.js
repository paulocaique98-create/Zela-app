import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Recepção só visualiza · docs/roadmap/PLANO_MARKETING.md (Fase B)
// Banco local, contas reais. A Recepção (role 'admin') lê e NÃO escreve em
// comunicados, calendário, mural, cardápio e aulas especiais. Gestão,
// Coordenação/Direção e Marketing continuam publicando onde já publicavam.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Recepção só visualiza', () => {
  const ctx = {};

  beforeAll(async () => {
    ctx.schoolId = await createTestSchool();
    ctx.outraEscola = await createTestSchool();
    await adminClient.from('schools').update({ features_enabled: { marketing: true } }).eq('id', ctx.schoolId);
    ctx.recepcao = await createTestUser({ role: 'admin', schoolId: ctx.schoolId, extra: { departamento: 'recepcao' } });
    ctx.gestao = await createTestUser({ role: 'gestao', schoolId: ctx.schoolId });
    ctx.coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: ctx.schoolId });
    ctx.mkt = await createTestUser({ role: 'marketing', schoolId: ctx.schoolId });
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.schoolId });
    ctx.recepcaoOutra = await createTestUser({ role: 'admin', schoolId: ctx.outraEscola });

    const uid = ctx.gestao.id;
    const ins = async (t, row) => {
      const { data, error } = await adminClient.from(t).insert(row).select('id').single();
      if (error) throw error;
      return data.id;
    };
    ctx.comunicado = await ins('comunicados', { school_id: ctx.schoolId, title: 'Vitest Aviso', body: 'Texto', created_by: uid });
    ctx.evento = await ins('eventos_calendario', { school_id: ctx.schoolId, title: 'Vitest Evento', event_date: '2026-12-01', created_by: uid });
    ctx.mural = await ins('mural_fotos', { school_id: ctx.schoolId, storage_path: `${ctx.schoolId}/x.png`, uploaded_by: uid });
    ctx.cardapio = await ins('cardapios', { school_id: ctx.schoolId, titulo: 'Vitest Cardápio' });
    ctx.aula = await ins('aulas_especiais', { school_id: ctx.schoolId, nome: 'Vitest Aula', categoria: 'geral', frequencia: 'semanal' });
    ctx.comunicadoOutra = await ins('comunicados', { school_id: ctx.outraEscola, title: 'Vitest Outra', body: 'x', created_by: uid });
  }, 60000);

  afterAll(async () => {
    for (const s of [ctx.schoolId, ctx.outraEscola]) {
      if (!s) continue;
      for (const t of ['comunicados', 'eventos_calendario', 'mural_fotos', 'cardapios', 'aulas_especiais']) {
        await adminClient.from(t).delete().eq('school_id', s);
      }
    }
    for (const u of [ctx.recepcao, ctx.gestao, ctx.coord, ctx.mkt, ctx.familia, ctx.recepcaoOutra]) {
      if (u?.id) await deleteTestUser(u.id);
    }
    await deleteTestSchool(ctx.schoolId);
    await deleteTestSchool(ctx.outraEscola);
  }, 60000);

  const linhas = () => ([
    ['comunicados', { title: 'Invasor', body: 'x' }, 'comunicado'],
    ['eventos_calendario', { title: 'Invasor', event_date: '2026-12-02' }, 'evento'],
    ['mural_fotos', { storage_path: 'x/y.png' }, 'mural'],
    ['cardapios', { titulo: 'Invasor' }, 'cardapio'],
    ['aulas_especiais', { nome: 'Invasora', categoria: 'geral', frequencia: 'semanal' }, 'aula'],
  ]);

  it('Recepção lê as cinco áreas da própria escola', async () => {
    for (const [tabela, , chave] of linhas()) {
      const { data } = await ctx.recepcao.client.from(tabela).select('id').eq('id', ctx[chave]);
      expect([tabela, data.length]).toEqual([tabela, 1]);
    }
    const { data: itens, error } = await ctx.recepcao.client.from('cardapio_itens').select('id').limit(1);
    expect(error).toBeNull();
    expect(itens).toEqual([]);
  });

  it('Recepção não insere, não edita e não exclui', async () => {
    for (const [tabela, extra, chave] of linhas()) {
      const { error } = await ctx.recepcao.client.from(tabela).insert({ school_id: ctx.schoolId, ...extra });
      expect([tabela, error === null]).toEqual([tabela, false]);

      const { data: upd } = await ctx.recepcao.client.from(tabela).update({ school_id: ctx.schoolId }).eq('id', ctx[chave]).select('id');
      expect([tabela, upd]).toEqual([tabela, []]);

      const { data: del } = await ctx.recepcao.client.from(tabela).delete().eq('id', ctx[chave]).select('id');
      expect([tabela, del]).toEqual([tabela, []]);

      const { data: ainda } = await adminClient.from(tabela).select('id').eq('id', ctx[chave]);
      expect([tabela, ainda.length]).toEqual([tabela, 1]);
    }
  });

  it('Recepção não lê nem escreve na outra escola', async () => {
    const { data } = await ctx.recepcao.client.from('comunicados').select('id').eq('id', ctx.comunicadoOutra);
    expect(data).toEqual([]);
    const { error } = await ctx.recepcao.client.from('comunicados').insert({ school_id: ctx.outraEscola, title: 'x', body: 'x' });
    expect(error).not.toBeNull();
  });

  it('Gestão e Coordenação continuam publicando', async () => {
    for (const quem of [ctx.gestao, ctx.coord]) {
      const c = await quem.client.from('comunicados').insert({ school_id: ctx.schoolId, title: 'Vitest Pub', body: 'x', created_by: quem.id }).select('id').single();
      expect(c.error).toBeNull();
      const e = await quem.client.from('eventos_calendario').insert({ school_id: ctx.schoolId, title: 'Vitest Pub', event_date: '2026-12-03', created_by: quem.id }).select('id').single();
      expect(e.error).toBeNull();
    }
    const card = await ctx.coord.client.from('cardapios').insert({ school_id: ctx.schoolId, titulo: 'Vitest Pub' });
    expect(card.error).toBeNull();
  });

  it('Marketing publica em calendário, comunicado e mural, mas não em cardápio nem aula especial', async () => {
    const c = ctx.mkt.client;
    expect((await c.from('comunicados').insert({ school_id: ctx.schoolId, title: 'Vitest Mkt', body: 'x', created_by: ctx.mkt.id })).error).toBeNull();
    expect((await c.from('eventos_calendario').insert({ school_id: ctx.schoolId, title: 'Vitest Mkt', event_date: '2026-12-04', created_by: ctx.mkt.id })).error).toBeNull();
    expect((await c.from('mural_fotos').insert({ school_id: ctx.schoolId, storage_path: `${ctx.schoolId}/m.png`, uploaded_by: ctx.mkt.id })).error).toBeNull();
    expect((await c.from('cardapios').insert({ school_id: ctx.schoolId, titulo: 'x' })).error).not.toBeNull();
    expect((await c.from('aulas_especiais').insert({ school_id: ctx.schoolId, nome: 'x', categoria: 'geral', frequencia: 'semanal' })).error).not.toBeNull();
  });

  it('Família continua lendo comunicados, calendário e cardápio', async () => {
    for (const [tabela, , chave] of linhas().filter(l => l[0] !== 'mural_fotos')) {
      const { data } = await ctx.familia.client.from(tabela).select('id').eq('id', ctx[chave]);
      expect([tabela, data.length]).toEqual([tabela, 1]);
    }
  });
});
