import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Fase C1 · docs/roadmap/PLANO_MARKETING.md
// Banco local, contas reais. Durante a troca de 'admin' para 'recepcao' as duas
// strings têm o mesmo acesso, preso à própria escola, e a Fase B (só visualiza)
// continua valendo. Família e professor não ganham nada.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('C1: admin e recepcao aceitos', () => {
  const ctx = {};

  beforeAll(async () => {
    ctx.schoolId = await createTestSchool();
    ctx.outraEscola = await createTestSchool();
    ctx.admin = await createTestUser({ role: 'admin', schoolId: ctx.schoolId });
    ctx.recepcao = await createTestUser({ role: 'recepcao', schoolId: ctx.schoolId });
    ctx.recepcaoOutra = await createTestUser({ role: 'recepcao', schoolId: ctx.outraEscola });
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.schoolId });
    ctx.prof = await createTestUser({ role: 'teacher', schoolId: ctx.schoolId });
    const ins = async (school, title) => {
      const { data, error } = await adminClient.from('comunicados')
        .insert({ school_id: school, title, body: 'x', created_by: ctx.admin.id }).select('id').single();
      if (error) throw error;
      return data.id;
    };
    ctx.comunicado = await ins(ctx.schoolId, 'Vitest C1');
    ctx.comunicadoOutra = await ins(ctx.outraEscola, 'Vitest C1 outra');
  }, 60000);

  afterAll(async () => {
    for (const s of [ctx.schoolId, ctx.outraEscola]) {
      if (s) await adminClient.from('comunicados').delete().eq('school_id', s);
    }
    for (const u of [ctx.admin, ctx.recepcao, ctx.recepcaoOutra, ctx.familia, ctx.prof]) {
      if (u?.id) await deleteTestUser(u.id);
    }
    await deleteTestSchool(ctx.schoolId);
    await deleteTestSchool(ctx.outraEscola);
  }, 60000);

  const rpc = async (u, fn) => (await u.client.rpc(fn)).data;

  it('funções de papel tratam admin e recepcao igual, e negam família e professor', async () => {
    expect(await rpc(ctx.admin, 'can_read_gestao')).toBe(true);
    expect(await rpc(ctx.recepcao, 'can_read_gestao')).toBe(true);
    expect(await rpc(ctx.familia, 'can_read_gestao')).toBe(false);
    expect(await rpc(ctx.prof, 'can_read_gestao')).toBe(false);
    for (const fn of ['can_read_financeiro', 'mapa_le_escola']) {
      expect([fn, await rpc(ctx.recepcao, fn)]).toEqual([fn, await rpc(ctx.admin, fn)]);
      expect([fn, await rpc(ctx.familia, fn)]).not.toEqual([fn, true]);
    }
  });

  it('has_permission da recepcao segue o mesmo conjunto do admin', async () => {
    const { data: cat } = await adminClient.from('permission_catalog').select('permission').limit(40);
    for (const { permission } of cat) {
      const a = (await ctx.admin.client.rpc('has_permission', { p_permission: permission })).data;
      const r = (await ctx.recepcao.client.rpc('has_permission', { p_permission: permission })).data;
      expect([permission, r]).toEqual([permission, a]);
    }
  });

  it('policies: recepcao lê a própria escola, não a outra, e continua sem escrever (Fase B)', async () => {
    const mine = await ctx.recepcao.client.from('comunicados').select('id').eq('id', ctx.comunicado);
    expect(mine.data.length).toBe(1);
    const other = await ctx.recepcao.client.from('comunicados').select('id').eq('id', ctx.comunicadoOutra);
    expect(other.data).toEqual([]);
    const ins = await ctx.recepcao.client.from('comunicados').insert({ school_id: ctx.schoolId, title: 'x', body: 'x' });
    expect(ins.error).not.toBeNull();
  });

  it('família e professor não leem system_updates (admin e developer apenas)', async () => {
    const ok = await ctx.recepcao.client.from('system_updates').select('id').limit(1);
    expect(ok.error).toBeNull();
    for (const u of [ctx.familia, ctx.prof]) {
      const { data } = await u.client.from('system_updates').select('id').limit(1);
      expect(data ?? []).toEqual([]);
    }
  });
});
