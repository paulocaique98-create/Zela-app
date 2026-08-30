import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY } from './envForTests.js';

// Cliente service_role — só usado nestes testes de integração pra montar/
// limpar dados descartáveis (nunca em código de produção). Mesmo padrão de
// setup/teardown seguido manualmente ao longo de toda a Fase 17.
export const adminClient = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  : null;

let seq = 0;
// Gera um sufixo curto e único por execução de teste — evita colisão entre
// rodadas paralelas/repetidas sem precisar de um UUID inteiro no e-mail.
function uniqueSuffix() {
  seq += 1;
  return `${Date.now().toString(36)}${seq}`;
}

// Cria um usuário de teste descartável completo (auth.users + public.users)
// e devolve um client autenticado como ele, pronto pra testar RLS/rotas.
export async function createTestUser({ role, schoolId, extra = {} }) {
  const suffix = uniqueSuffix();
  const email = `vitest.${suffix}@zela-teste.com`;
  const password = 'SenhaTeste123!';

  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError) throw authError;

  const { error: dbError } = await adminClient.from('users').insert({
    id: authUser.user.id,
    email,
    name: `Vitest ${suffix}`,
    role,
    school_id: schoolId ?? null,
    ...extra,
  });
  if (dbError) throw dbError;

  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: session, error: loginError } = await anonClient.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  return { id: authUser.user.id, email, client: userClient, token: session.session.access_token };
}

export async function deleteTestUser(id) {
  await adminClient.from('users').delete().eq('id', id);
  await adminClient.auth.admin.deleteUser(id).catch(() => {});
}

export async function createTestSchool(namePrefix = 'Vitest Escola') {
  const suffix = uniqueSuffix().slice(-4).toUpperCase();
  const { data, error } = await adminClient
    .from('schools')
    .insert({ name: `${namePrefix} ${suffix}`, school_code: `VT${suffix}`.slice(0, 5) })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteTestSchool(id) {
  try {
    await adminClient.from('schools').delete().eq('id', id);
  } catch {
    // best-effort — usado em limpeza, nunca deve derrubar o teste
  }
}
