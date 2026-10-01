import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// "Token inválido ou expirado" (01/10/2026): a mesma conta da Recepção aberta
// no totem e no computador da recepção. Sair num aparelho encerrava a sessão
// nos dois (padrão global da biblioteca) e o aviso de entrada/saída às
// famílias passava a falhar no totem. Aqui, com contas reais:
//   · saída só do aparelho (como o app faz agora): o totem continua avisando;
//   · saída em todos os aparelhos (como era): reproduz o erro do registro.
const runIf = hasIntegrationCredentials ? describe : describe.skip;
const SENHA = 'SenhaTeste123!';

async function entrar(email) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw error;
  return { client, token: data.session.access_token };
}

async function avisarFamilia(token, studentId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-checkin-request`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: studentId, event_type: 'pending_entry' }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

runIf('Sair de um aparelho não derruba o totem', () => {
  const ctx = { contas: [] };

  beforeAll(async () => {
    ctx.escola = await createTestSchool('Vitest Sair Aparelho');
    ctx.recepcao = await createTestUser({ role: 'admin', schoolId: ctx.escola, extra: { departamento: 'recepcao' } });
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.escola });
    ctx.contas.push(ctx.recepcao.id, ctx.familia.id);
    const { data: aluno } = await adminClient.from('students')
      .insert({ name: 'Vitest Aluno Totem', school_id: ctx.escola, family_id: ctx.familia.id }).select('id').single();
    ctx.alunoId = aluno.id;
  }, 60000);

  afterAll(async () => {
    await adminClient.from('notifications').delete().eq('student_id', ctx.alunoId);
    await adminClient.from('students').delete().eq('id', ctx.alunoId);
    for (const id of ctx.contas) await deleteTestUser(id);
    await deleteTestSchool(ctx.escola);
  }, 60000);

  it('saída só do aparelho (como o app faz agora): o totem continua avisando a família', async () => {
    const totem = await entrar(ctx.recepcao.email);
    const computador = await entrar(ctx.recepcao.email);
    await computador.client.auth.signOut({ scope: 'local' });
    const r = await avisarFamilia(totem.token, ctx.alunoId);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.success).toBe(true);
  }, 30000);

  it('saída em todos os aparelhos (como era): o totem passa a receber "Token inválido ou expirado"', async () => {
    const totem = await entrar(ctx.recepcao.email);
    const computador = await entrar(ctx.recepcao.email);
    await computador.client.auth.signOut({ scope: 'global' });
    const r = await avisarFamilia(totem.token, ctx.alunoId);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Token inválido ou expirado');
  }, 30000);
});
