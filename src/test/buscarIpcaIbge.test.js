import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SUPABASE_URL, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// buscar-ipca-ibge contra o IBGE real e o Supabase local. Exige `npx supabase functions serve` e ZELA_E2E=1.
// A função só lê: nada pode ser gravado em zela_ipca_anual.
const runIf = hasIntegrationCredentials && process.env.ZELA_E2E === '1' ? describe : describe.skip;

runIf('buscar-ipca-ibge', () => {
  const c = {};
  const chamar = (headers = {}) => fetch(`${SUPABASE_URL}/functions/v1/buscar-ipca-ibge`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
  const bearer = (u) => ({ Authorization: `Bearer ${u.session?.access_token ?? u.token}` });

  beforeAll(async () => {
    c.escola = await createTestSchool();
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestao = await createTestUser({ role: 'gestao', schoolId: c.escola });
  }, 60000);

  afterAll(async () => {
    for (const u of [c.dev, c.gestao]) if (u?.id) await deleteTestUser(u.id);
    if (c.escola) await deleteTestSchool(c.escola);
  }, 60000);

  it('sem token 401; Gestão 403', async () => {
    expect((await chamar()).status).toBe(401);
    expect((await chamar(bearer(c.gestao))).status).toBe(403);
  });

  it('developer recebe o IPCA do IBGE e nada é gravado', async () => {
    const { count: antes } = await adminClient.from('zela_ipca_anual').select('ano', { count: 'exact', head: true });
    const r = await chamar(bearer(c.dev));
    const j = await r.json();
    expect(r.status, JSON.stringify(j)).toBe(200);
    expect(j.periodo).toMatch(/^\d{6}$/);
    expect(j.ano).toBeGreaterThanOrEqual(2024);
    expect(j.mes).toBeGreaterThanOrEqual(1);
    expect(j.mes).toBeLessThanOrEqual(12);
    expect(j.percentual).toBeGreaterThanOrEqual(0);
    expect(j.percentual).toBeLessThanOrEqual(30);
    const { count: depois } = await adminClient.from('zela_ipca_anual').select('ano', { count: 'exact', head: true });
    expect(depois).toBe(antes);
  }, 60000);
});
