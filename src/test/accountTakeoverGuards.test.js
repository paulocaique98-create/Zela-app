import { describe, it, expect } from 'vitest';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Auditoria de segurança 27/09/2026 · item 3. Trocar o e-mail (já
// confirmado) de outra conta + "Esqueci minha senha" = tomar a conta. Antes
// qualquer admin da escola fazia isso com qualquer usuário da escola,
// inclusive a Gestão e o admin principal, e conseguia apagar a conta da
// Gestão -- anulando a separação Recepção/Gestão.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function callFn(name, token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function authEmail(userId) {
  const { data } = await adminClient.auth.admin.getUserById(userId);
  return data?.user?.email;
}

const newEmail = () => `vitest.troca.${Date.now()}${Math.random().toString(36).slice(2, 6)}@zela-teste.com`;

runIf('update-user-email · admin comum não toma conta protegida', () => {
  it('admin comum NÃO troca o e-mail da conta da Gestão', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    try {
      const { status } = await callFn('update-user-email', admin.token, { user_id: gestao.id, new_email: newEmail() });
      expect(status).not.toBe(200);
      expect(await authEmail(gestao.id)).toBe(gestao.email);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 25000);

  it('admin comum NÃO troca o e-mail do admin principal nem de outro admin', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const primary = await createTestUser({ role: 'admin', schoolId, extra: { is_primary_admin: true } });
    const otherAdmin = await createTestUser({ role: 'admin', schoolId });
    try {
      const r1 = await callFn('update-user-email', admin.token, { user_id: primary.id, new_email: newEmail() });
      expect(r1.status).not.toBe(200);
      expect(await authEmail(primary.id)).toBe(primary.email);

      const r2 = await callFn('update-user-email', admin.token, { user_id: otherAdmin.id, new_email: newEmail() });
      expect(r2.status).not.toBe(200);
      expect(await authEmail(otherAdmin.id)).toBe(otherAdmin.email);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestUser(primary.id);
      await deleteTestUser(otherAdmin.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);

  it('fluxo normal continua: admin corrige e-mail de família; admin principal corrige e-mail de outro admin', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const primary = await createTestUser({ role: 'admin', schoolId, extra: { is_primary_admin: true } });
    const family = await createTestUser({ role: 'family', schoolId });
    try {
      const familyEmail = newEmail();
      const r1 = await callFn('update-user-email', admin.token, { user_id: family.id, new_email: familyEmail });
      expect(r1.status).toBe(200);
      expect(await authEmail(family.id)).toBe(familyEmail);

      const adminEmail = newEmail();
      const r2 = await callFn('update-user-email', primary.token, { user_id: admin.id, new_email: adminEmail });
      expect(r2.status).toBe(200);
      expect(await authEmail(admin.id)).toBe(adminEmail);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestUser(primary.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);

  it('salvar cadastro da Gestão SEM mudar o e-mail continua funcionando (AdminUserRegistration chama em todo salvamento)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    try {
      const { status } = await callFn('update-user-email', admin.token, { user_id: gestao.id, new_email: gestao.email });
      expect(status).toBe(200);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 25000);

  it('não dá pra disfarçar a troca alterando public.users antes (compara com o e-mail de login)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    try {
      const attackerEmail = newEmail();
      await admin.client.from('users').update({ email: attackerEmail }).eq('id', gestao.id);
      const { status } = await callFn('update-user-email', admin.token, { user_id: gestao.id, new_email: attackerEmail });
      expect(status).not.toBe(200);
      expect(await authEmail(gestao.id)).toBe(gestao.email);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 25000);
});

runIf('delete-user · Recepção não apaga a conta da Gestão', () => {
  it('admin NÃO exclui a conta da Gestão', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    try {
      const { status } = await callFn('delete-user', admin.token, { userId: gestao.id });
      expect(status).not.toBe(200);
      const { data: stillThere } = await adminClient.from('users').select('id').eq('id', gestao.id).maybeSingle();
      expect(stillThere).not.toBeNull();
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 25000);

  it('fluxo normal continua: admin exclui conta de família', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    try {
      const { status } = await callFn('delete-user', admin.token, { userId: family.id });
      expect(status).toBe(200);
      const { data: gone } = await adminClient.from('users').select('id').eq('id', family.id).maybeSingle();
      expect(gone).toBeNull();
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 25000);
});
