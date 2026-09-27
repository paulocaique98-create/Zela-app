import { describe, it, expect } from 'vitest';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Hierarquia de contas, Fase 1 (27/09/2026): a Gestão é o topo da escola e
// assume os poderes que eram só do admin principal -- em PARALELO (o admin
// principal continua podendo; o corte é a Fase 3). Admin comum continua
// barrado onde já era.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function callFn(name, token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const email = (tag) => `vitest.hier.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@zela-teste.com`;

async function setup() {
  const schoolId = await createTestSchool();
  await adminClient.from('schools').update({ turmas: ['Nido'] }).eq('id', schoolId);
  const gestao = await createTestUser({ role: 'gestao', schoolId });
  const admin = await createTestUser({ role: 'admin', schoolId });
  return { schoolId, gestao, admin, users: [gestao, admin] };
}
async function teardown(s, extraIds = []) {
  for (const id of extraIds) await deleteTestUser(id);
  await adminClient.from('students').delete().eq('school_id', s.schoolId);
  for (const u of s.users) await deleteTestUser(u.id);
  await deleteTestSchool(s.schoolId);
}

runIf('Hierarquia · Fase 1: Gestão com os poderes do admin principal', () => {
  it('Gestão gerencia turmas e configuração de cobrança da escola; admin comum continua barrado', async () => {
    const s = await setup();
    try {
      const { error: turmasErr } = await s.gestao.client.rpc('update_school_turmas', { p_turmas: ['Nido', 'Kids I'] });
      expect(turmasErr).toBeNull();
      const { error: renameErr } = await s.gestao.client.rpc('rename_school_turma', { p_old_name: 'Kids I', p_new_name: 'Kids 1' });
      expect(renameErr).toBeNull();
      const { error: billingErr } = await s.gestao.client.from('schools').update({ billing_config: { hourly_rate_cents: 4000 } }).eq('id', s.schoolId);
      expect(billingErr).toBeNull();

      const { data: school } = await adminClient.from('schools').select('turmas, billing_config').eq('id', s.schoolId).single();
      expect(school.turmas).toEqual(['Nido', 'Kids 1']);
      expect(school.billing_config.hourly_rate_cents).toBe(4000);

      const { error: adminTurmasErr } = await s.admin.client.rpc('update_school_turmas', { p_turmas: ['Nido'] });
      expect(adminTurmasErr).not.toBeNull();
    } finally {
      await teardown(s);
    }
  }, 30000);

  it('Gestão configura horário por dia do aluno e a visibilidade total do chat de um admin', async () => {
    const s = await setup();
    const { data: student } = await adminClient.from('students').insert({ school_id: s.schoolId, name: 'Vitest Hierarquia Aluno', turma: 'Nido' }).select('id').single();
    try {
      const { error: wsErr } = await s.gestao.client.from('students').update({ weekly_schedule: { segunda: { entry: '07:00', exit: '12:00' } } }).eq('id', student.id);
      expect(wsErr).toBeNull();
      const { error: chatErr } = await s.gestao.client.from('users').update({ chat_visibilidade_total: true }).eq('id', s.admin.id);
      expect(chatErr).toBeNull();
      const { data: adminRow } = await adminClient.from('users').select('chat_visibilidade_total').eq('id', s.admin.id).single();
      expect(adminRow.chat_visibilidade_total).toBe(true);
    } finally {
      await teardown(s);
    }
  }, 30000);

  it('Gestão cria admin (sempre na própria escola) e exclui admin; admin comum não exclui admin', async () => {
    const s = await setup();
    const otherSchool = await createTestSchool();
    let createdId = null;
    try {
      const { status, body } = await callFn('create-admin-user', s.gestao.token, {
        email: email('novoadmin'), password: 'SenhaTeste123!', name: 'Admin Criado pela Gestão', role: 'admin', school_id: otherSchool,
      });
      expect(status).toBe(200);
      expect(body.school_id).toBe(s.schoolId);
      createdId = body.id;

      const asAdmin = await callFn('delete-user', s.admin.token, { userId: createdId });
      expect(asAdmin.status).not.toBe(200);

      const asGestao = await callFn('delete-user', s.gestao.token, { userId: createdId });
      expect(asGestao.status).toBe(200);
      const { data: gone } = await adminClient.from('users').select('id').eq('id', createdId).maybeSingle();
      expect(gone).toBeNull();
      createdId = null;
    } finally {
      await teardown(s, createdId ? [createdId] : []);
      await deleteTestSchool(otherSchool);
    }
  }, 40000);

  it('Gestão corrige o e-mail do admin principal; admin comum não', async () => {
    const s = await setup();
    const primary = await createTestUser({ role: 'admin', schoolId: s.schoolId, extra: { is_primary_admin: true } });
    s.users.push(primary);
    try {
      const asAdmin = await callFn('update-user-email', s.admin.token, { user_id: primary.id, new_email: email('x') });
      expect(asAdmin.status).not.toBe(200);
      const newEmail = email('primary');
      const asGestao = await callFn('update-user-email', s.gestao.token, { user_id: primary.id, new_email: newEmail });
      expect(asGestao.status).toBe(200);
      const { data } = await adminClient.auth.admin.getUserById(primary.id);
      expect(data.user.email).toBe(newEmail);
    } finally {
      await teardown(s);
    }
  }, 40000);

  it('bug corrigido: Gestão cria conta do 2º responsável (aprovação de matrícula)', async () => {
    const s = await setup();
    const { data: student } = await adminClient.from('students').insert({ school_id: s.schoolId, name: 'Vitest Segundo Resp Aluno', turma: 'Nido' }).select('id').single();
    let createdId = null;
    try {
      const { status, body } = await callFn('create-family-user', s.gestao.token, {
        name: 'Segundo Responsável Vitest', email: email('segundo'), password: 'SenhaTeste123!',
        school_id: s.schoolId, student_ids: [student.id], is_financial: false, must_change_password: true,
      });
      expect(status).toBe(200);
      createdId = body.user?.id || null;
      expect(createdId).toBeTruthy();
    } finally {
      if (createdId) {
        await adminClient.from('student_guardians').delete().eq('guardian_id', createdId);
        await adminClient.from('authorized_persons').delete().eq('family_id', createdId);
      }
      await teardown(s, createdId ? [createdId] : []);
    }
  }, 40000);
});
