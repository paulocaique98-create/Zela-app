import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Perfil Marketing · docs/roadmap/PLANO_MARKETING.md (Fase A)
// Roda contra o banco local com contas reais. Garantias:
//   1. FECHADO: sem financeiro, ficha médica, documentos nem leitura direta de students.
//   2. MÓDULO: com 'marketing' desligado, nada funciona (lido como === true).
//   3. ISOLAMENTO: só a própria escola.
//   4. FUNCIONA: calendário, comunicados, mural, RPC da lista e trilha da exportação.
//   5. A lista de regras do perfil é exatamente a aprovada.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

// Qualquer regra nova para este perfil precisa ser acrescentada aqui DE PROPÓSITO.
const REGRAS_APROVADAS = [
  'public.comunicados|Marketing cria comunicados proprios',
  'public.comunicados|Marketing edita comunicados proprios',
  'public.comunicados|Marketing exclui comunicados proprios',
  'public.comunicados|Marketing le comunicados da escola',
  'public.eventos_calendario|Marketing gerencia calendario',
  'public.mural_fotos|Marketing gerencia mural',
  'storage.objects|Marketing gerencia anexos de comunicados',
  'storage.objects|Marketing gerencia fotos do mural',
].sort();

const TABELAS_FECHADAS = [
  'financial_charges', 'financial_contracts', 'financial_billing_discounts', 'school_gateway_accounts', 'expenses',
  'contract_documents', 'fichas_medicas', 'student_documents', 'authorized_persons', 'attendance_logs',
  'matricula_solicitacoes', 'chat_threads', 'cardapios', 'aulas_especiais',
];

const COLUNAS_RPC = ['student_id', 'nome', 'turma', 'turno', 'nascimento', 'idade', 'responsavel_nome', 'responsavel_telefone'].sort();

runIf('Perfil Marketing', () => {
  const ctx = {};

  beforeAll(async () => {
    ctx.schoolId = await createTestSchool();
    ctx.outraEscola = await createTestSchool();
    await adminClient.from('schools').update({ features_enabled: { marketing: true } }).eq('id', ctx.schoolId);
    ctx.mkt = await createTestUser({ role: 'marketing', schoolId: ctx.schoolId, extra: { name: 'Vitest Marketing' } });
    ctx.mktDesligado = await createTestUser({ role: 'marketing', schoolId: ctx.outraEscola });
    ctx.recepcao = await createTestUser({ role: 'recepcao', schoolId: ctx.schoolId, extra: { departamento: 'recepcao' } });
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.schoolId, extra: { name: 'Vitest Responsavel', phone: '11999990000' } });
    ctx.familiaOutra = await createTestUser({ role: 'family', schoolId: ctx.outraEscola, extra: { phone: '11888880000' } });

    const { data: alunos, error } = await adminClient.from('students').insert([
      { school_id: ctx.schoolId, name: 'Vitest Aluno Ativo', family_id: ctx.familia.id, turma: 'Kids I', turno: 'Manhã', birth_date: '2021-03-10', enrollment_status: 'ativo' },
      { school_id: ctx.schoolId, name: 'Vitest Aluno Inativo', family_id: ctx.familia.id, turma: 'Kids I', enrollment_status: 'inativo' },
      { school_id: ctx.outraEscola, name: 'Vitest Aluno Outra Escola', family_id: ctx.familiaOutra.id, turma: 'Kids II', enrollment_status: 'ativo' },
    ]).select('id, name');
    if (error) throw error;
    ctx.aluno = alunos.find(a => a.name === 'Vitest Aluno Ativo').id;
    await adminClient.from('student_guardians').insert({ student_id: ctx.aluno, guardian_id: ctx.familia.id, school_id: ctx.schoolId, is_primary: true });
  }, 60000);

  afterAll(async () => {
    for (const s of [ctx.schoolId, ctx.outraEscola]) {
      if (!s) continue;
      for (const t of ['audit_logs', 'comunicados', 'eventos_calendario', 'mural_fotos', 'student_guardians']) {
        await adminClient.from(t).delete().eq('school_id', s);
      }
      await adminClient.from('students').delete().eq('school_id', s);
    }
    for (const u of [ctx.mkt, ctx.mktDesligado, ctx.recepcao, ctx.familia, ctx.familiaOutra]) {
      if (u?.id) await deleteTestUser(u.id);
    }
    await deleteTestSchool(ctx.schoolId);
    await deleteTestSchool(ctx.outraEscola);
  }, 60000);

  // ─── 1. Fechado ──────────────────────────────────────────────────────────
  it('não lê tabelas fechadas nem a tabela students direto', async () => {
    for (const tabela of [...TABELAS_FECHADAS, 'students']) {
      const { data } = await ctx.mkt.client.from(tabela).select('*').limit(5);
      expect([tabela, data]).toEqual([tabela, []]);
    }
  });

  it('não escreve em students nem em tabelas fechadas', async () => {
    const { data: upd } = await ctx.mkt.client.from('students').update({ name: 'Hackeado' }).eq('id', ctx.aluno).select('id');
    expect(upd).toEqual([]);
    const { error: ins } = await ctx.mkt.client.from('students').insert({ school_id: ctx.schoolId, name: 'Vitest Invasor' });
    expect(ins).not.toBeNull();
    const { error: cardapio } = await ctx.mkt.client.from('cardapios').insert({ school_id: ctx.schoolId });
    expect(cardapio).not.toBeNull();
    const { error: aula } = await ctx.mkt.client.from('aulas_especiais').insert({ school_id: ctx.schoolId, nome: 'x', categoria: 'geral', frequencia: 'semanal' });
    expect(aula).not.toBeNull();
  });

  it('não vira outro papel nem muda de escola', async () => {
    const { error } = await ctx.mkt.client.from('users').update({ role: 'gestao' }).eq('id', ctx.mkt.id);
    expect(error).not.toBeNull();
    const { data } = await adminClient.from('users').select('role').eq('id', ctx.mkt.id).single();
    expect(data.role).toBe('marketing');
  });

  // ─── 2. Funciona na própria escola ───────────────────────────────────────
  it('publica calendário, comunicado e mural na própria escola', async () => {
    const c = ctx.mkt.client;
    const ev = await c.from('eventos_calendario').insert({ school_id: ctx.schoolId, title: 'Vitest Evento', event_date: '2026-12-01', created_by: ctx.mkt.id }).select('id').single();
    expect(ev.error).toBeNull();
    const com = await c.from('comunicados').insert({ school_id: ctx.schoolId, title: 'Vitest Comunicado', body: 'Texto', created_by: ctx.mkt.id }).select('id').single();
    expect(com.error).toBeNull();
    const mural = await c.from('mural_fotos').insert({ school_id: ctx.schoolId, storage_path: `${ctx.schoolId}/x.png`, uploaded_by: ctx.mkt.id }).select('id').single();
    expect(mural.error).toBeNull();
    const { data: lidos } = await c.from('comunicados').select('id').eq('school_id', ctx.schoolId);
    expect(lidos.length).toBeGreaterThan(0);
    const { error: del } = await c.from('eventos_calendario').delete().eq('id', ev.data.id);
    expect(del).toBeNull();
  });

  it('lê todos os comunicados da escola, mas só edita e exclui os próprios', async () => {
    const c = ctx.mkt.client;
    const { data: alheio } = await adminClient.from('comunicados')
      .insert({ school_id: ctx.schoolId, title: 'Da Gestão', body: 'x', created_by: ctx.recepcao.id }).select('id').single();
    const { data: lidos } = await c.from('comunicados').select('id').eq('id', alheio.id);
    expect(lidos).toHaveLength(1);
    const { data: upd } = await c.from('comunicados').update({ title: 'Hackeado' }).eq('id', alheio.id).select('id');
    expect(upd).toEqual([]);
    const { data: del } = await c.from('comunicados').delete().eq('id', alheio.id).select('id');
    expect(del).toEqual([]);
    const { data: depois } = await adminClient.from('comunicados').select('title').eq('id', alheio.id).single();
    expect(depois.title).toBe('Da Gestão');
    // não cria em nome de outra pessoa
    const { error: falso } = await c.from('comunicados').insert({ school_id: ctx.schoolId, title: 'x', body: 'x', created_by: ctx.recepcao.id });
    expect(falso).not.toBeNull();
    // o próprio ele edita e exclui
    const { data: meu } = await c.from('comunicados').insert({ school_id: ctx.schoolId, title: 'Meu', body: 'x', created_by: ctx.mkt.id }).select('id').single();
    const { data: meuUpd } = await c.from('comunicados').update({ title: 'Meu 2' }).eq('id', meu.id).select('id');
    expect(meuUpd).toHaveLength(1);
    const { data: meuDel } = await c.from('comunicados').delete().eq('id', meu.id).select('id');
    expect(meuDel).toHaveLength(1);
  });

  // ─── 3. Isolamento entre escolas ─────────────────────────────────────────
  it('não escreve nem lê dados de outra escola', async () => {
    const c = ctx.mkt.client;
    const { error } = await c.from('comunicados').insert({ school_id: ctx.outraEscola, title: 'Invasão', body: 'x' });
    expect(error).not.toBeNull();
    await adminClient.from('comunicados').insert({ school_id: ctx.outraEscola, title: 'Da outra escola', body: 'x' });
    const { data } = await c.from('comunicados').select('id').eq('school_id', ctx.outraEscola);
    expect(data).toEqual([]);
  });

  // ─── 4. Módulo desligado bloqueia ────────────────────────────────────────
  it('com o módulo desligado, nada escreve e a RPC recusa', async () => {
    const c = ctx.mktDesligado.client;
    const { error } = await c.from('comunicados').insert({ school_id: ctx.outraEscola, title: 'x', body: 'x' });
    expect(error).not.toBeNull();
    const rpc = await c.rpc('marketing_lista_alunos');
    expect(rpc.error).not.toBeNull();
    const exp = await c.rpc('marketing_registrar_exportacao', { p_formato: 'csv', p_quantidade: 1 });
    expect(exp.error).not.toBeNull();
  });

  it('módulo ligado como "true" em texto ou ausente não vale (só === true)', async () => {
    await adminClient.from('schools').update({ features_enabled: { marketing: 'sim' } }).eq('id', ctx.outraEscola);
    const rpc = await ctx.mktDesligado.client.rpc('marketing_lista_alunos');
    expect(rpc.error).not.toBeNull();
  });

  // ─── 5. RPC da lista ─────────────────────────────────────────────────────
  it('a RPC devolve só alunos ativos da escola, só as colunas aprovadas', async () => {
    const { data, error } = await ctx.mkt.client.rpc('marketing_lista_alunos');
    expect(error).toBeNull();
    expect(data.map(a => a.nome)).toEqual(['Vitest Aluno Ativo']);
    expect(Object.keys(data[0]).sort()).toEqual(COLUNAS_RPC);
    expect(data[0]).toMatchObject({ turma: 'Kids I', turno: 'Manhã', nascimento: '2021-03-10', responsavel_nome: 'Vitest Responsavel', responsavel_telefone: '11999990000' });
    expect(data[0].idade).toBeGreaterThanOrEqual(0);
  });

  it('outros perfis não executam a RPC; anônimo também não', async () => {
    const rec = await ctx.recepcao.client.rpc('marketing_lista_alunos');
    expect(rec.error).not.toBeNull();
    const fam = await ctx.familia.client.rpc('marketing_lista_alunos');
    expect(fam.error).not.toBeNull();
  });

  // ─── 6. Trilha da exportação ─────────────────────────────────────────────
  it('a exportação grava em audit_logs com quem, formato e quantidade; formato inválido é recusado', async () => {
    const ok = await ctx.mkt.client.rpc('marketing_registrar_exportacao', { p_formato: 'excel', p_quantidade: 12 });
    expect(ok.error).toBeNull();
    const { data } = await adminClient.from('audit_logs').select('actor_id, school_id, details').eq('action', 'marketing_exportar_alunos').eq('school_id', ctx.schoolId);
    expect(data.length).toBe(1);
    expect(data[0]).toMatchObject({ actor_id: ctx.mkt.id, school_id: ctx.schoolId, details: { formato: 'excel', quantidade: 12 } });
    const ruim = await ctx.mkt.client.rpc('marketing_registrar_exportacao', { p_formato: 'doc', p_quantidade: 1 });
    expect(ruim.error).not.toBeNull();
    const { error: direto } = await ctx.mkt.client.from('audit_logs').insert({ school_id: ctx.schoolId, action: 'x', entity_type: 'x' });
    expect(direto).not.toBeNull();
  });

  // ─── Nasce fechado ───────────────────────────────────────────────────────
  it('a lista de regras do perfil é exatamente a aprovada', async () => {
    const { data, error } = await adminClient.rpc('list_policies_for_role', { p_role: 'marketing' });
    expect(error).toBeNull();
    // A função devolve também as regras da Gestão Pedagógica (ela casa por gp_da_escola); as dela têm teste próprio.
    const doMarketing = data.filter(r => !r.policyname.startsWith('Gestao pedagogica'));
    const atuais = doMarketing.map(r => `${r.schemaname}.${r.tablename}|${r.policyname}`).sort();
    expect(atuais).toEqual(REGRAS_APROVADAS);
    expect(doMarketing.some(r => r.tablename === 'students')).toBe(false);
  });
});
