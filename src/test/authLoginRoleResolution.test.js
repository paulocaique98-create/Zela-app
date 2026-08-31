import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { createTestUser, deleteTestUser, createTestSchool, deleteTestSchool, adminClient } from './supabaseTestHelpers.js';

// P1.1 (Prompt Mestre de Evolução) — Zero testes cobriam o pilar do
// sistema inteiro: de onde vem a `role` usada pra autorização. O fluxo
// real (src/components/Login.jsx) é: 1) supabase.auth.signInWithPassword
// -> 2) SELECT * FROM public.users WHERE id = auth.uid() -> 3) o `role`
// dessa linha (nunca do JWT) decide o que a pessoa pode fazer daqui pra
// frente em todo o app.
//
// Estes testes não renderizam o componente React (o projeto não usa
// Testing Library) — testam o mecanismo real por trás dele: a mesma
// query que o Login.jsx faz, contra um banco real, pros 4 perfis
// principais, e a invariante mais crítica de todas: que forjar o JWT
// (user_metadata) do lado do cliente NUNCA muda a role que o app
// realmente usa. Essa é exatamente a classe de vulnerabilidade já achada
// e corrigida nesta auditoria (policies que liam auth.jwt()->user_metadata
// em vez de get_my_role()/public.users.role).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

// Simula a query exata que Login.jsx faz depois do signInWithPassword.
async function loginAndResolveRole(client, userId) {
  const { data: users, error } = await client.from('users').select('*').eq('id', userId);
  return { users, error };
}

runIf('Resolução de role no login (auth + public.users)', () => {
  it('admin: role resolvida no login é exatamente "admin", vinda de public.users', async () => {
    const school = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId: school });
    try {
      const { users, error } = await loginAndResolveRole(admin.client, admin.id);
      expect(error).toBeNull();
      expect(users).toHaveLength(1);
      expect(users[0].role).toBe('admin');
      expect(users[0].id).toBe(admin.id);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestSchool(school);
    }
  });

  it('teacher: role resolvida no login é exatamente "teacher"', async () => {
    const school = await createTestSchool();
    const teacher = await createTestUser({ role: 'teacher', schoolId: school });
    try {
      const { users, error } = await loginAndResolveRole(teacher.client, teacher.id);
      expect(error).toBeNull();
      expect(users[0].role).toBe('teacher');
    } finally {
      await deleteTestUser(teacher.id);
      await deleteTestSchool(school);
    }
  });

  it('family: role resolvida no login é exatamente "family"', async () => {
    const school = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId: school });
    try {
      const { users, error } = await loginAndResolveRole(family.client, family.id);
      expect(error).toBeNull();
      expect(users[0].role).toBe('family');
    } finally {
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  });

  it('developer: role resolvida no login é exatamente "developer" (sem school_id)', async () => {
    const developer = await createTestUser({ role: 'developer', schoolId: null });
    try {
      const { users, error } = await loginAndResolveRole(developer.client, developer.id);
      expect(error).toBeNull();
      expect(users[0].role).toBe('developer');
    } finally {
      await deleteTestUser(developer.id);
    }
  });

  it('usuário sem linha em public.users (excluído/inexistente) — Login.jsx trata como não autorizado: query real retorna vazio, nunca um erro que possa ser mal interpretado como sucesso', async () => {
    const school = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId: school });
    try {
      // Simula "conta removida": apaga só a linha de public.users, mantendo
      // o login de auth.users válido (exatamente o cenário que o
      // handleVisibilityChange do App.jsx e o Login.jsx tratam).
      await adminClient.from('users').delete().eq('id', family.id);

      const { users, error } = await loginAndResolveRole(family.client, family.id);
      expect(error).toBeNull();
      expect(users).toEqual([]); // Login.jsx: users.length === 0 -> "Acesso não autorizado"
    } finally {
      // Já apagamos a linha de public.users; só falta o auth.users e a escola.
      await deleteTestUser(family.id).catch(() => {});
      await deleteTestSchool(school);
    }
  });

  it('CRÍTICO — forjar user_metadata.role no JWT (auth.updateUser) não muda a role real resolvida no login, nem o que get_my_role() (usado em toda RLS) enxerga', async () => {
    const school = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId: school });
    try {
      // Tenta se autopromover mexendo só no metadata do próprio JWT — o
      // mesmo vetor já achado e corrigido nesta auditoria (RLS que lia
      // auth.jwt()->user_metadata em vez da tabela).
      const { data: updateData } = await family.authClient.auth.updateUser({ data: { role: 'developer' } });

      // Confirma que o metadata FOI forjado com sucesso do lado do
      // cliente (a resposta do próprio updateUser já reflete isso) -- o
      // objetivo do teste não é impedir isso (é um dado do usuário,
      // sempre editável por ele), é confirmar que NADA no app real usa
      // esse claim pra decidir permissão.
      expect(updateData?.user?.user_metadata?.role).toBe('developer');

      // Mas a query real do login (public.users) continua mostrando a
      // verdade, porque não olha pra JWT nenhum:
      const { users } = await loginAndResolveRole(family.client, family.id);
      expect(users[0].role).toBe('family');

      // E get_my_role() -- usada em toda RLS do projeto -- também ignora
      // o JWT forjado, porque lê direto de public.users:
      const { data: realRole } = await family.client.rpc('get_my_role');
      expect(realRole).toBe('family');
    } finally {
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  });

  it('usuário com status="pending" ainda resolve role normalmente na query (o gate é feito no client, em cima deste dado) -- confirma que o campo que Login.jsx checa está presente e correto', async () => {
    const school = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId: school, extra: { status: 'pending' } });
    try {
      const { users } = await loginAndResolveRole(family.client, family.id);
      expect(users[0].status).toBe('pending');
      expect(users[0].role).toBe('family');
    } finally {
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  });
});
