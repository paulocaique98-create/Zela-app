import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Login.jsx: o código de escola informado na tela de login (usado antes só
// pra buscar a imagem) agora é validado contra a escola REAL do usuário
// autenticado -- se não bater, a sessão é encerrada na hora. Como o
// projeto não usa Testing Library em nenhum componente, o teste replica a
// mesma sequência de queries feita em handleLogin (2.5) contra o banco
// real, em vez de montar o componente.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function loginAndValidate(email, password, rawCode) {
  const enteredCode = rawCode.trim();
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) return { error: authError };

  const { data: users } = await client.from('users').select('*').eq('id', authData.user.id);
  const user = users[0];

  if (enteredCode && user.role !== 'developer') {
    const { data: schoolRow } = await client.from('schools').select('school_code').eq('id', user.school_id).maybeSingle();
    if (schoolRow && schoolRow.school_code.toUpperCase() !== enteredCode.toUpperCase()) {
      await client.auth.signOut();
      return { blocked: true };
    }
  }

  const { data: sessionCheck } = await client.auth.getSession();
  return { ok: true, hasSession: !!sessionCheck.session };
}

runIf('Login -- validação do código de escola pós-autenticação', () => {
  it('código correto mantém a sessão; código errado encerra a sessão; sem código não valida; normaliza minúsculo/espaço', async () => {
    const school = await createTestSchool();
    const { data: schoolRow } = await adminClient.from('schools').select('school_code').eq('id', school).single();
    const email = `vitest.schoolcode.${Date.now()}@zela-teste.com`;
    const password = 'SenhaTeste123!';
    const { data: authUser } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
    await adminClient.from('users').insert({ id: authUser.user.id, email, name: 'Vitest', role: 'admin', school_id: school, status: 'active' });

    try {
      let r = await loginAndValidate(email, password, schoolRow.school_code);
      expect(r.ok).toBe(true);
      expect(r.hasSession).toBe(true);

      r = await loginAndValidate(email, password, 'ZZ999');
      expect(r.blocked).toBe(true);

      r = await loginAndValidate(email, password, '');
      expect(r.ok).toBe(true);
      expect(r.hasSession).toBe(true);

      r = await loginAndValidate(email, password, `  ${schoolRow.school_code.toLowerCase()}  `);
      expect(r.ok).toBe(true);
      expect(r.hasSession).toBe(true);
    } finally {
      await deleteTestUser(authUser.user.id);
      await deleteTestSchool(school);
    }
  }, 20000);

  it('developer ignora o código informado (não tem escola própria pra validar contra)', async () => {
    const email = `vitest.schoolcode.dev.${Date.now()}@zela-teste.com`;
    const password = 'SenhaTeste123!';
    const { data: authUser } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
    await adminClient.from('users').insert({ id: authUser.user.id, email, name: 'Vitest Dev', role: 'developer', school_id: null, status: 'active' });

    try {
      const r = await loginAndValidate(email, password, 'ZZ999');
      expect(r.ok).toBe(true);
      expect(r.hasSession).toBe(true);
    } finally {
      await deleteTestUser(authUser.user.id);
    }
  }, 15000);
});
