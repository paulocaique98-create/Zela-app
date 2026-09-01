import { describe, it, expect } from 'vitest';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Notificação de admin quando um responsável se autocadastra e fica
// pendente — antes disso, a escola só descobria entrando manualmente em
// Usuários > Pendentes. Testa a rota real (self-register-family, Edge
// Function pública) de ponta a ponta.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Notificação de admin — cadastro pendente (self-register-family -> notifyAdmins)', () => {
  it('admin recebe notificação in-app ao autocadastro de um responsável, consegue marcar como lida, e usePendingUsersCount reflete a contagem', async () => {
    const school = await createTestSchool();
    const { data: schoolRow } = await adminClient.from('schools').select('school_code').eq('id', school).single();
    const admin = await createTestUser({ role: 'admin', schoolId: school });

    const familyEmail = `vitest.pendingnotify.${Date.now()}@zela-teste.com`;
    let familyId = null;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/self-register-family`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_code: schoolRow.school_code, name: 'Vitest Pending Family', email: familyEmail, password: 'SenhaTeste123!',
          students: [{ name: 'Vitest Aluno', birth_date: '2020-01-01' }],
        }),
      });
      expect(res.status).toBe(200);

      const { data: familyRow } = await adminClient.from('users').select('id').eq('email', familyEmail).single();
      familyId = familyRow.id;

      // Notificação chegou pro admin (via family_id reaproveitado como
      // "id do destinatário", mesma query que NotificationsDropdown.jsx usa).
      const { data: notifs } = await admin.client.from('notifications').select('type, message, url, read_at').eq('family_id', admin.id);
      expect(notifs).toHaveLength(1);
      expect(notifs[0].type).toBe('pending_registration');
      expect(notifs[0].message).toContain('Vitest Pending Family');
      expect(notifs[0].url).toBe('/?tab=users');
      expect(notifs[0].read_at).toBeNull();

      // Admin marca como lida (mesma ação de abrir o sino).
      const { error: updateErr } = await admin.client.from('notifications').update({ read_at: new Date().toISOString() }).eq('family_id', admin.id);
      expect(updateErr).toBeNull();

      // Contagem de pendentes (mesma query de usePendingUsersCount.js).
      const { count } = await admin.client.from('users').select('id', { count: 'exact', head: true }).eq('school_id', school).eq('role', 'family').eq('status', 'pending');
      expect(count).toBe(1);
    } finally {
      if (familyId) {
        await adminClient.from('students').delete().eq('family_id', familyId);
        await adminClient.from('authorized_persons').delete().eq('family_id', familyId);
        await deleteTestUser(familyId);
      }
      await adminClient.from('notifications').delete().eq('school_id', school);
      await deleteTestUser(admin.id);
      await deleteTestSchool(school);
    }
  }, 15000);

  it('CRÍTICO — admin de outra escola não vê a notificação nem conta o pendente de escola alheia', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const adminA = await createTestUser({ role: 'admin', schoolId: schoolA });
    const adminB = await createTestUser({ role: 'admin', schoolId: schoolB });
    const familyPending = await createTestUser({ role: 'family', schoolId: schoolA, extra: { status: 'pending' } });

    // Notificação simulada diretamente (sem passar pela Edge Function de
    // novo, já testada no teste anterior) -- só pra isolar o teste de RLS.
    await adminClient.from('notifications').insert({ school_id: schoolA, family_id: adminA.id, type: 'pending_registration', message: 'Teste isolamento' });

    try {
      const { data: notifsB } = await adminB.client.from('notifications').select('id').eq('school_id', schoolA);
      expect(notifsB).toEqual([]);

      const { count } = await adminB.client.from('users').select('id', { count: 'exact', head: true }).eq('school_id', schoolA).eq('role', 'family').eq('status', 'pending');
      expect(count).toBe(0); // RLS de adminB só enxerga school_id=schoolB
    } finally {
      await adminClient.from('notifications').delete().eq('school_id', schoolA);
      await deleteTestUser(adminA.id);
      await deleteTestUser(adminB.id);
      await deleteTestUser(familyPending.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  }, 15000);
});
