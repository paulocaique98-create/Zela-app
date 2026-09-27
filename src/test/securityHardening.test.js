import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { hasIntegrationCredentials, SUPABASE_URL, ANON_KEY } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Correções da auditoria de segurança (27/09/2026), itens 1 e 6.
// Item 1: funções internas de presença (_apply_*) e RPCs de correção/
// transferência não podem ser executadas por quem não tem permissão --
// inclusive sem login, onde get_my_role() é NULL e uma checagem do tipo
// "role not in (...)" vira NULL e deixava passar.
// Também cobre o fluxo legítimo (Recepção solicita, Gestão aprova, lançamento
// manual), que não tinha nenhum teste até aqui.
const runIf = hasIntegrationCredentials ? describe : describe.skip;
const anon = hasIntegrationCredentials ? createClient(SUPABASE_URL, ANON_KEY) : null;

const YESTERDAY_10H = new Date(Date.now() - 24 * 60 * 60 * 1000);
YESTERDAY_10H.setUTCHours(13, 0, 0, 0); // 10:00 em Brasília
const iso = (d) => d.toISOString();
const plusMinutes = (d, m) => new Date(d.getTime() + m * 60 * 1000);

async function setupScenario() {
  const schoolId = await createTestSchool();
  const family = await createTestUser({ role: 'family', schoolId });
  const { data: student, error: studentErr } = await adminClient.from('students')
    .insert({ school_id: schoolId, name: 'Vitest Segurança Aluno', turma: 'Nido', family_id: family.id })
    .select('id').single();
  if (studentErr) throw studentErr;
  const { data: log, error: logErr } = await adminClient.from('attendance_logs')
    .insert({ school_id: schoolId, student_id: student.id, family_id: family.id, event_type: 'exit', event_time: iso(YESTERDAY_10H) })
    .select('id, event_time').single();
  if (logErr) throw logErr;
  return { schoolId, family, studentId: student.id, logId: log.id, originalTime: log.event_time };
}

async function teardown({ schoolId, studentId }, users) {
  await adminClient.from('attendance_corrections').delete().eq('student_id', studentId);
  await adminClient.from('attendance_logs').delete().eq('student_id', studentId);
  await adminClient.from('student_transfers').delete().eq('student_id', studentId);
  await adminClient.from('students').delete().eq('id', studentId);
  for (const u of users) await deleteTestUser(u.id);
  await deleteTestSchool(schoolId);
}

async function logTime(logId) {
  const { data } = await adminClient.from('attendance_logs').select('event_time, event_type').eq('id', logId).single();
  return data;
}

runIf('Segurança · funções internas de presença bloqueadas pra quem não tem permissão', () => {
  it('sem login: _apply_attendance_correction não altera o registro', async () => {
    const s = await setupScenario();
    try {
      const { error } = await anon.rpc('_apply_attendance_correction', { p_log_id: s.logId, p_new_event_time: iso(plusMinutes(YESTERDAY_10H, -60)) });
      expect(error).not.toBeNull();
      expect(new Date((await logTime(s.logId)).event_time).getTime()).toBe(new Date(s.originalTime).getTime());
    } finally {
      await teardown(s, [s.family]);
    }
  }, 20000);

  it('família logada: não chama _apply_attendance_correction no registro do próprio filho', async () => {
    const s = await setupScenario();
    try {
      const { error } = await s.family.client.rpc('_apply_attendance_correction', { p_log_id: s.logId, p_new_event_time: iso(plusMinutes(YESTERDAY_10H, -60)) });
      expect(error).not.toBeNull();
      expect(new Date((await logTime(s.logId)).event_time).getTime()).toBe(new Date(s.originalTime).getTime());
    } finally {
      await teardown(s, [s.family]);
    }
  }, 20000);

  it('sem login: _apply_attendance_manual_entry não insere presença falsa', async () => {
    const s = await setupScenario();
    try {
      const { error } = await anon.rpc('_apply_attendance_manual_entry', {
        p_school_id: s.schoolId, p_student_id: s.studentId, p_event_type: 'entry',
        p_event_time: iso(plusMinutes(YESTERDAY_10H, -120)), p_reason_code: 'x', p_reason_detail: null,
      });
      expect(error).not.toBeNull();
      const { data: logs } = await adminClient.from('attendance_logs').select('id').eq('student_id', s.studentId);
      expect(logs).toHaveLength(1);
    } finally {
      await teardown(s, [s.family]);
    }
  }, 20000);

  it('sem login: request_attendance_correction e request_attendance_manual_entry são recusadas', async () => {
    const s = await setupScenario();
    try {
      const { error: e1 } = await anon.rpc('request_attendance_correction', {
        p_log_id: s.logId, p_new_event_time: iso(plusMinutes(YESTERDAY_10H, -60)), p_reason_code: 'x',
        p_reason_detail: null, p_minutes_delta: -60, p_increases_billing: false,
      });
      expect(e1).not.toBeNull();
      const { error: e2 } = await anon.rpc('request_attendance_manual_entry', {
        p_student_id: s.studentId, p_event_type: 'entry', p_new_event_time: iso(plusMinutes(YESTERDAY_10H, -120)),
        p_reason_code: 'x', p_reason_detail: null, p_minutes_delta: 0, p_increases_billing: false,
      });
      expect(e2).not.toBeNull();
      expect(new Date((await logTime(s.logId)).event_time).getTime()).toBe(new Date(s.originalTime).getTime());
      const { data: corrections } = await adminClient.from('attendance_corrections').select('id').eq('student_id', s.studentId);
      expect(corrections).toEqual([]);
    } finally {
      await teardown(s, [s.family]);
    }
  }, 20000);

  it('família logada: não consegue solicitar correção do próprio filho', async () => {
    const s = await setupScenario();
    try {
      const { error } = await s.family.client.rpc('request_attendance_correction', {
        p_log_id: s.logId, p_new_event_time: iso(plusMinutes(YESTERDAY_10H, -60)), p_reason_code: 'x',
        p_reason_detail: null, p_minutes_delta: -60, p_increases_billing: false,
      });
      expect(error).not.toBeNull();
      expect(new Date((await logTime(s.logId)).event_time).getTime()).toBe(new Date(s.originalTime).getTime());
    } finally {
      await teardown(s, [s.family]);
    }
  }, 20000);

  it('sem login: transfer_student_to_external_school não marca o aluno como transferido', async () => {
    const s = await setupScenario();
    try {
      const { error } = await anon.rpc('transfer_student_to_external_school', { p_student_id: s.studentId, p_destination_school_name: 'Escola Invasora' });
      expect(error).not.toBeNull();
      const { data: student } = await adminClient.from('students').select('enrollment_status').eq('id', s.studentId).single();
      expect(student.enrollment_status).toBe('ativo');
    } finally {
      await teardown(s, [s.family]);
    }
  }, 20000);
});

runIf('Segurança · fluxo legítimo de correção de presença continua funcionando', () => {
  it('Recepção (admin) solicita correção que NÃO aumenta cobrança: aplica na hora', async () => {
    const s = await setupScenario();
    const admin = await createTestUser({ role: 'admin', schoolId: s.schoolId });
    try {
      const newTime = plusMinutes(YESTERDAY_10H, -30);
      const { data, error } = await admin.client.rpc('request_attendance_correction', {
        p_log_id: s.logId, p_new_event_time: iso(newTime), p_reason_code: 'esqueceu_registro',
        p_reason_detail: null, p_minutes_delta: -30, p_increases_billing: false,
      });
      expect(error).toBeNull();
      expect(data.status).toBe('applied');
      expect(new Date((await logTime(s.logId)).event_time).getTime()).toBe(newTime.getTime());
    } finally {
      await teardown(s, [s.family, admin]);
    }
  }, 20000);

  it('correção que aumenta cobrança fica pendente e só a Gestão aprova (admin não aprova)', async () => {
    const s = await setupScenario();
    const admin = await createTestUser({ role: 'admin', schoolId: s.schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId: s.schoolId });
    try {
      const newTime = plusMinutes(YESTERDAY_10H, 45);
      const { data: requested, error: reqErr } = await admin.client.rpc('request_attendance_correction', {
        p_log_id: s.logId, p_new_event_time: iso(newTime), p_reason_code: 'saiu_mais_tarde',
        p_reason_detail: null, p_minutes_delta: 45, p_increases_billing: true,
      });
      expect(reqErr).toBeNull();
      expect(requested.status).toBe('pending');
      expect(new Date((await logTime(s.logId)).event_time).getTime()).toBe(new Date(s.originalTime).getTime());

      const { error: adminApproveErr } = await admin.client.rpc('approve_attendance_correction', { p_correction_id: requested.correction_id, p_approve: true });
      expect(adminApproveErr).not.toBeNull();

      const { error: gestaoErr } = await gestao.client.rpc('approve_attendance_correction', { p_correction_id: requested.correction_id, p_approve: true });
      expect(gestaoErr).toBeNull();
      expect(new Date((await logTime(s.logId)).event_time).getTime()).toBe(newTime.getTime());
    } finally {
      await teardown(s, [s.family, admin, gestao]);
    }
  }, 25000);

  it('admin de outra escola não corrige registro alheio', async () => {
    const s = await setupScenario();
    const otherSchool = await createTestSchool();
    const otherAdmin = await createTestUser({ role: 'admin', schoolId: otherSchool });
    try {
      const { error } = await otherAdmin.client.rpc('request_attendance_correction', {
        p_log_id: s.logId, p_new_event_time: iso(plusMinutes(YESTERDAY_10H, -30)), p_reason_code: 'x',
        p_reason_detail: null, p_minutes_delta: -30, p_increases_billing: false,
      });
      expect(error).not.toBeNull();
      expect(new Date((await logTime(s.logId)).event_time).getTime()).toBe(new Date(s.originalTime).getTime());
    } finally {
      await teardown(s, [s.family, otherAdmin]);
      await deleteTestSchool(otherSchool);
    }
  }, 25000);

  it('Recepção lança presença manual que não aumenta cobrança: cria o registro', async () => {
    const s = await setupScenario();
    const admin = await createTestUser({ role: 'admin', schoolId: s.schoolId });
    try {
      const { data, error } = await admin.client.rpc('request_attendance_manual_entry', {
        p_student_id: s.studentId, p_event_type: 'entry', p_new_event_time: iso(plusMinutes(YESTERDAY_10H, -180)),
        p_reason_code: 'esqueceu_registro', p_reason_detail: null, p_minutes_delta: 0, p_increases_billing: false,
      });
      expect(error).toBeNull();
      expect(data.status).toBe('applied');
      const { data: logs } = await adminClient.from('attendance_logs').select('id').eq('student_id', s.studentId);
      expect(logs).toHaveLength(2);
    } finally {
      await teardown(s, [s.family, admin]);
    }
  }, 20000);
});

runIf('Segurança · item 2: fim da senha padrão 123456 e troca obrigatória', () => {
  it('conta com senha provisória não consegue desligar a troca obrigatória sozinha; desliga ao trocar a senha de verdade', async () => {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId, extra: { must_change_password: true } });
    try {
      const { error: selfClearErr } = await family.client.from('users').update({ must_change_password: false }).eq('id', family.id);
      expect(selfClearErr).not.toBeNull();
      const { data: stillFlagged } = await adminClient.from('users').select('must_change_password').eq('id', family.id).single();
      expect(stillFlagged.must_change_password).toBe(true);

      const { error: pwdErr } = await family.authClient.auth.updateUser({ password: 'NovaSenhaVitest!2026' });
      expect(pwdErr).toBeNull();
      const { data: cleared } = await adminClient.from('users').select('must_change_password').eq('id', family.id).single();
      expect(cleared.must_change_password).toBe(false);
    } finally {
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 25000);

  it('admin da escola consegue exigir troca de senha de uma família (marcar o flag)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    try {
      const { error } = await admin.client.from('users').update({ must_change_password: true }).eq('id', family.id);
      expect(error).toBeNull();
      const { data } = await adminClient.from('users').select('must_change_password').eq('id', family.id).single();
      expect(data.must_change_password).toBe(true);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 20000);

  it('matrícula pública recusa senha curta e a antiga senha padrão (nenhuma conta é criada)', async () => {
    const schoolId = await createTestSchool();
    const { data: school } = await adminClient.from('schools').select('school_code').eq('id', schoolId).single();
    const email = `vitest.pub.${Date.now()}@zela-teste.com`;
    try {
      for (const password of ['123456', 'abc123']) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/public-matricula-request`, {
          method: 'POST',
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_code: school.school_code, email, password,
            responsavel: { nome: 'Vitest Pub', telefone: '27999999999' },
            criancas: [{ nome: 'Vitest Criança', nascimento: '2022-01-01', ciclo: '6', periodo: '07:00 às 13:00' }],
          }),
        });
        expect(res.status).not.toBe(200);
      }
      const { data: created } = await adminClient.from('users').select('id').eq('email', email);
      expect(created).toEqual([]);
    } finally {
      const { data: leftovers } = await adminClient.from('users').select('id').eq('email', email);
      for (const u of leftovers || []) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});

runIf('Segurança · acesso legado do totem (x-kiosk-token) removido', () => {
  it('nenhum token de totem legado continua ativo', async () => {
    const { data: active } = await adminClient.from('kiosk_devices').select('id').eq('is_active', true);
    expect(active).toEqual([]);
  }, 15000);
});
