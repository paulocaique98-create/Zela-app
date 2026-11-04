import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Bloqueio por inadimplência: escola suspensa (is_active=false) perde dados para TODOS os perfis,
// inclusive a Gestão, que só vê a tela de bloqueio via meu_estado_bloqueio. Roda no Supabase LOCAL.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Bloqueio por inadimplência', () => {
  const c = {};
  const TABELAS = ['students', 'users', 'notifications', 'daily_attendance_status', 'attendance_logs', 'authorized_persons', 'zela_cobrancas', 'school_contratacoes'];

  beforeAll(async () => {
    c.A = await createTestSchool();
    c.B = await createTestSchool();
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestaoA = await createTestUser({ role: 'gestao', schoolId: c.A });
    c.adminA = await createTestUser({ role: 'admin', schoolId: c.A });
    c.teacherA = await createTestUser({ role: 'teacher', schoolId: c.A });
    c.familyA = await createTestUser({ role: 'family', schoolId: c.A });
    c.gestaoB = await createTestUser({ role: 'gestao', schoolId: c.B });
    const venc = new Date(Date.now() - 20 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const { data: plano } = await adminClient.from('zela_planos').select('id').limit(1).single();
    const { data: ct, error: e1 } = await adminClient.from('school_contratacoes').insert({
      school_id: c.A, plano_id: plano.id, ciclo: 'MENSAL', meses: 1, alunos_contratados: 10, itens: [], snapshot: {},
      valor_mensal: 100, valor_ciclo: 100, implantacao_base: 0, implantacao_final: 0, status: 'ativa',
      inicio: venc, fim: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10),
    }).select('id').single();
    if (e1) throw e1;
    const { error: e2 } = await adminClient.from('zela_cobrancas').insert({
      school_id: c.A, contratacao_id: ct.id, tipo: 'parcela', numero: 1, competencia: venc, vencimento: venc,
      valor_sistema: 100, valor_implantacao: 0, status: 'vencida', invoice_url: 'https://pagar.exemplo/a',
    });
    if (e2) throw e2;
    c.ct = ct.id;
  }, 120000);

  afterAll(async () => {
    for (const s of [c.A, c.B]) {
      if (!s) continue;
      await adminClient.from('zela_cobrancas').delete().eq('school_id', s);
      await adminClient.from('school_contratacoes').delete().eq('school_id', s);
      await adminClient.from('zela_bloqueios_log').delete().eq('school_id', s);
    }
    for (const u of [c.dev, c.gestaoA, c.adminA, c.teacherA, c.familyA, c.gestaoB]) if (u?.id) await deleteTestUser(u.id);
    for (const s of [c.A, c.B]) if (s) await deleteTestSchool(s);
  }, 120000);

  const suspender = (ativa) => adminClient.from('schools').update({ is_active: ativa }).eq('id', c.A);

  it('escola liberada: Gestão A enxerga a própria cobrança e meu_estado_bloqueio diz liberada', async () => {
    await suspender(true);
    const { data: st } = await c.gestaoA.client.rpc('meu_estado_bloqueio');
    expect(st.suspensa).toBe(false);
    const { data } = await c.gestaoA.client.from('zela_cobrancas').select('id');
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  it('escola suspensa: nenhum perfil da escola A lê dados, nem a Gestão', async () => {
    await suspender(false);
    for (const u of [c.gestaoA, c.adminA, c.teacherA, c.familyA]) {
      for (const t of TABELAS) {
        if (t === 'users') continue; // cada usuário ainda lê a própria linha (auth.uid)
        const { data } = await u.client.from(t).select('id').limit(5);
        expect(data ?? [], `${t} para ${u.role ?? 'perfil'}`).toHaveLength(0);
      }
    }
  });

  it('Gestão suspensa vê a tela de bloqueio com o link; os demais perfis não recebem a cobrança', async () => {
    const { data: g } = await c.gestaoA.client.rpc('meu_estado_bloqueio');
    expect(g.suspensa).toBe(true);
    expect(g.cobranca.invoice_url).toBe('https://pagar.exemplo/a');
    expect(g.cobranca.dias_atraso).toBeGreaterThanOrEqual(20);
    expect(g.cobranca.valor).toBe(100);
    const { data: a } = await c.adminA.client.rpc('meu_estado_bloqueio');
    expect(a.suspensa).toBe(true);
    expect(a.cobranca).toBeNull();
  });

  it('isolamento: escola B segue normal e não vê a cobrança de A; developer isento', async () => {
    const { data: b } = await c.gestaoB.client.rpc('meu_estado_bloqueio');
    expect(b.suspensa).toBe(false);
    const { data: cobsB } = await c.gestaoB.client.from('zela_cobrancas').select('id').eq('school_id', c.A);
    expect(cobsB ?? []).toHaveLength(0);
    const { data: d } = await c.dev.client.rpc('meu_estado_bloqueio');
    expect(d.suspensa).toBe(false);
    const { data: devCobs } = await c.dev.client.from('zela_cobrancas').select('id').eq('school_id', c.A);
    expect(devCobs.length).toBeGreaterThan(0);
  });

  it('escola_liberada fica fechada para o app (só service_role)', async () => {
    const { error } = await c.gestaoB.client.rpc('escola_liberada', { p_school_id: c.A });
    expect(error).not.toBeNull();
    const { data } = await adminClient.rpc('escola_liberada', { p_school_id: c.A });
    expect(data).toBe(false);
  });

  it('a Gestão suspensa não consegue se reativar nem escrever em schools', async () => {
    await c.gestaoA.client.from('schools').update({ is_active: true }).eq('id', c.A);
    const { data } = await adminClient.from('schools').select('is_active').eq('id', c.A).single();
    expect(data.is_active).toBe(false);
  });

  it('funções SECURITY DEFINER chamadas pelo app recusam usuário de escola suspensa', async () => {
    const recusou = (r) => { expect(r.error?.message ?? '').toMatch(/Acesso suspenso/); };
    recusou(await c.familyA.client.rpc('request_account_deletion', { p_reason: 'teste' }));
    recusou(await c.familyA.client.rpc('registrar_token_push_app', { p_token: 'x'.repeat(40), p_platform: 'android' }));
    recusou(await c.gestaoA.client.rpc('approve_atualizacao_cadastral', { p_solicitacao_id: '00000000-0000-0000-0000-000000000000' }));
    const { data } = await c.familyA.client.rpc('listar_contas_vinculadas');
    expect(data ?? []).toHaveLength(0);
    // as 4 funções internas seguem fechadas para o app
    for (const fn of ['candidatos_unificar_responsaveis', 'chat_destinatarios', 'pesquisa_elegiveis']) {
      const { error } = await c.gestaoA.client.rpc(fn, { p_school_id: c.A, p_school: c.A, p_setor: 'recepcao', p_survey_id: c.A });
      expect(error, fn).not.toBeNull();
    }
  });

  it('reativar restaura o acesso e a trilha registra suspensão e reativação', async () => {
    await suspender(true);
    const { data: st } = await c.gestaoA.client.rpc('meu_estado_bloqueio');
    expect(st.suspensa).toBe(false);
    const { data: log } = await adminClient.from('zela_bloqueios_log').select('acao, origem').eq('school_id', c.A).order('created_at');
    const acoes = (log ?? []).map(l => l.acao);
    expect(acoes).toContain('suspensa');
    expect(acoes).toContain('reativada');
    const { data: lido } = await c.gestaoA.client.from('zela_bloqueios_log').select('id');
    expect(lido ?? []).toHaveLength(0); // só developer lê a trilha
  });
});
