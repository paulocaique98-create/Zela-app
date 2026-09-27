import { describe, it, expect } from 'vitest';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Hierarquia de contas, Fases 2 e 3 (27/09/2026):
//   - professor/responsável criado pelo admin nasce pendente; a Gestão cria
//     já ativo;
//   - admin só é criado pela Gestão; "admin principal" deixou de ter poder;
//   - excluir escola não trava mais em registros de erro/webhook.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function callFn(name, token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const email = (tag) => `vitest.h23.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@zela-teste.com`;

runIf('Hierarquia · Fase 2: criado pelo admin nasce pendente', () => {
  it('professor criado pelo admin fica pendente; criado pela Gestão já nasce ativo', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const created = [];
    try {
      const byAdmin = await callFn('create-admin-user', admin.token, { email: email('prof1'), password: 'SenhaTeste123!', name: 'Professor Pendente', role: 'teacher', school_id: schoolId });
      expect(byAdmin.status).toBe(200);
      created.push(byAdmin.body.id);
      expect(byAdmin.body.status).toBe('pending');

      const byGestao = await callFn('create-admin-user', gestao.token, { email: email('prof2'), password: 'SenhaTeste123!', name: 'Professor Ativo', role: 'teacher', school_id: schoolId });
      expect(byGestao.status).toBe(200);
      created.push(byGestao.body.id);
      expect(byGestao.body.status).not.toBe('pending');
    } finally {
      for (const id of created) await deleteTestUser(id);
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 40000);

  it('2º responsável criado pelo admin fica pendente', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const { data: student } = await adminClient.from('students').insert({ school_id: schoolId, name: 'Vitest H23 Aluno', turma: 'Nido' }).select('id').single();
    let createdId = null;
    try {
      const r = await callFn('create-family-user', admin.token, { name: 'Segundo Pendente', email: email('seg'), password: 'SenhaTeste123!', school_id: schoolId, student_ids: [student.id], is_financial: false });
      expect(r.status).toBe(200);
      createdId = r.body.user?.id;
      const { data } = await adminClient.from('users').select('status').eq('id', createdId).single();
      expect(data.status).toBe('pending');
    } finally {
      if (createdId) {
        await adminClient.from('student_guardians').delete().eq('guardian_id', createdId);
        await adminClient.from('authorized_persons').delete().eq('family_id', createdId);
        await deleteTestUser(createdId);
      }
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  }, 40000);
});

runIf('Hierarquia · Fase 3: poderes da Gestão, não do admin', () => {
  it('admin (nem o antigo "admin principal") não cria admin nem gerencia turmas; a Gestão sim', async () => {
    const schoolId = await createTestSchool();
    const primary = await createTestUser({ role: 'admin', schoolId, extra: { is_primary_admin: true } });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    let createdId = null;
    try {
      const asPrimary = await callFn('create-admin-user', primary.token, { email: email('adm'), password: 'SenhaTeste123!', name: 'Admin Negado', role: 'admin', school_id: schoolId });
      expect(asPrimary.status).not.toBe(200);
      expect(asPrimary.body.error).toMatch(/Gestão/);

      const { error: turmasErr } = await primary.client.rpc('update_school_turmas', { p_turmas: ['Nido', 'Kids I'] });
      expect(turmasErr?.message).toMatch(/Gestão/);

      const asGestao = await callFn('create-admin-user', gestao.token, { email: email('adm2'), password: 'SenhaTeste123!', name: 'Admin Criado', role: 'admin', school_id: schoolId });
      expect(asGestao.status).toBe(200);
      createdId = asGestao.body.id;
    } finally {
      if (createdId) await deleteTestUser(createdId);
      await deleteTestUser(primary.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 40000);

  it('antigo "admin principal" não libera mais a visibilidade total do chat; a Gestão libera', async () => {
    const schoolId = await createTestSchool();
    const primary = await createTestUser({ role: 'admin', schoolId, extra: { is_primary_admin: true } });
    const other = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    try {
      const { error: primaryErr } = await primary.client.from('users').update({ chat_visibilidade_total: true }).eq('id', other.id);
      expect(primaryErr).not.toBeNull();
      const { error: gestaoErr } = await gestao.client.from('users').update({ chat_visibilidade_total: true }).eq('id', other.id);
      expect(gestaoErr).toBeNull();
    } finally {
      for (const u of [primary, other, gestao]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});

runIf('Exclusão de escola pelo suporte', () => {
  it('não trava mais quando a escola tem registros de erro e eventos de webhook', async () => {
    const schoolId = await createTestSchool();
    const developer = await createTestUser({ role: 'developer', schoolId: null });
    try {
      await adminClient.from('error_logs').insert({ source: 'client', category: 'vitest', severity: 'error', message: 'vitest', fingerprint: `vitest-${Date.now()}`, school_id: schoolId });
      await adminClient.from('payment_webhook_events').insert({ school_id: schoolId, gateway: 'asaas', gateway_event_id: `evt_vitest_${Date.now()}`, event_type: 'X', payload: {} });

      const { error } = await developer.client.rpc('delete_school_and_users', { target_school_id: schoolId });
      expect(error).toBeNull();
      const { data: gone } = await adminClient.from('schools').select('id').eq('id', schoolId).maybeSingle();
      expect(gone).toBeNull();
    } finally {
      await deleteTestUser(developer.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});
