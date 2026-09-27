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

runIf('Segurança · item 4: professor não amplia o próprio acesso', () => {
  it('professor NÃO altera as próprias turmas nem o próprio status; admin altera normalmente', async () => {
    const schoolId = await createTestSchool();
    const teacher = await createTestUser({ role: 'teacher', schoolId, extra: { teacher_status: 'inativo', turmas: ['Nido'] } });
    const admin = await createTestUser({ role: 'admin', schoolId });
    try {
      await teacher.client.from('users').update({ turmas: ['Nido', 'Kids I', 'Kids II'] }).eq('id', teacher.id);
      await teacher.client.from('users').update({ teacher_status: 'ativo' }).eq('id', teacher.id);
      const { data: afterSelf } = await adminClient.from('users').select('turmas, teacher_status').eq('id', teacher.id).single();
      expect(afterSelf.turmas).toEqual(['Nido']);
      expect(afterSelf.teacher_status).toBe('inativo');

      const { error: adminErr } = await admin.client.from('users').update({ turmas: ['Nido', 'Kids I'], teacher_status: 'ativo' }).eq('id', teacher.id);
      expect(adminErr).toBeNull();
      const { data: afterAdmin } = await adminClient.from('users').select('turmas, teacher_status').eq('id', teacher.id).single();
      expect(afterAdmin.turmas).toEqual(['Nido', 'Kids I']);
      expect(afterAdmin.teacher_status).toBe('ativo');
    } finally {
      await deleteTestUser(teacher.id);
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  }, 25000);

  it('família continua editando telefone e aceites do próprio cadastro, mas não o próprio status', async () => {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId, extra: { status: 'pending' } });
    try {
      const { error: phoneErr } = await family.client.from('users').update({ phone: '27988887777', lgpd_accepted: true }).eq('id', family.id);
      expect(phoneErr).toBeNull();
      await family.client.from('users').update({ status: 'active' }).eq('id', family.id);
      const { data } = await adminClient.from('users').select('phone, status').eq('id', family.id).single();
      expect(data.phone).toBe('27988887777');
      expect(data.status).toBe('pending');
    } finally {
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 20000);
});

runIf('Segurança · item 5: família não mexe em cobrança nem apaga aluno', () => {
  async function setupFamilyStudent() {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId });
    const { data: student, error } = await adminClient.from('students')
      .insert({ school_id: schoolId, family_id: family.id, name: 'Vitest Cobrança Aluno', turma: 'Nido', contracted_exit_time: '13:00', isento_hora_extra: false, status: 'idle' })
      .select('id').single();
    if (error) throw error;
    return { schoolId, family, studentId: student.id };
  }
  async function cleanup({ schoolId, family, studentId }, extraUsers = []) {
    await adminClient.from('students').delete().eq('id', studentId);
    await adminClient.from('students').delete().eq('school_id', schoolId);
    await deleteTestUser(family.id);
    for (const u of extraUsers) await deleteTestUser(u.id);
    await deleteTestSchool(schoolId);
  }

  it('família NÃO se isenta de hora extra nem estica o horário contratado', async () => {
    const s = await setupFamilyStudent();
    try {
      await s.family.client.from('students').update({ isento_hora_extra: true }).eq('id', s.studentId);
      await s.family.client.from('students').update({ contracted_exit_time: '19:00' }).eq('id', s.studentId);
      await s.family.client.from('students').update({ turma: 'Kids I', enrollment_status: 'inativo' }).eq('id', s.studentId);
      const { data } = await adminClient.from('students').select('isento_hora_extra, contracted_exit_time, turma, enrollment_status').eq('id', s.studentId).single();
      expect(data.isento_hora_extra).toBe(false);
      expect(data.contracted_exit_time).toBe('13:00:00');
      expect(data.turma).toBe('Nido');
      expect(data.enrollment_status).toBe('ativo');
    } finally {
      await cleanup(s);
    }
  }, 20000);

  it('família NÃO apaga o próprio filho nem cria aluno na escola', async () => {
    const s = await setupFamilyStudent();
    try {
      await s.family.client.from('students').delete().eq('id', s.studentId);
      const { data: still } = await adminClient.from('students').select('id').eq('id', s.studentId).maybeSingle();
      expect(still).not.toBeNull();

      const { error: insertErr } = await s.family.client.from('students').insert({ school_id: s.schoolId, family_id: s.family.id, name: 'Aluno Inventado', turma: 'Nido' });
      expect(insertErr).not.toBeNull();
    } finally {
      await cleanup(s);
    }
  }, 20000);

  it('check-in/out só no autoatendimento: família NÃO registra entrada nem saída pelo celular', async () => {
    const s = await setupFamilyStudent();
    try {
      const nowIso = new Date().toISOString();
      await s.family.client.from('students')
        .update({ status: 'in_school', today_entry: '08:00', today_entry_at: nowIso })
        .eq('id', s.studentId);
      await s.family.client.from('students')
        .update({ status: 'left', today_exit: '12:00', today_exit_at: nowIso })
        .eq('id', s.studentId);
      const { data } = await adminClient.from('students').select('status, today_exit_at').eq('id', s.studentId).single();
      expect(data.status).toBe('idle');
      expect(data.today_exit_at).toBeNull();

      const { error: logErr } = await s.family.client.from('attendance_logs').insert({
        school_id: s.schoolId, student_id: s.studentId, family_id: s.family.id, event_type: 'exit', event_time: nowIso,
      });
      expect(logErr).not.toBeNull();
      const { data: logs } = await adminClient.from('attendance_logs').select('id').eq('student_id', s.studentId);
      expect(logs).toEqual([]);
    } finally {
      await cleanup(s);
    }
  }, 20000);

  it('"Não irá hoje": família avisa ausência antes da chegada; depois da chegada, não', async () => {
    const s = await setupFamilyStudent();
    const other = await createTestUser({ role: 'family', schoolId: s.schoolId });
    try {
      const { error: foreignErr } = await other.client.rpc('family_mark_student_absent', { p_student_id: s.studentId });
      expect(foreignErr).not.toBeNull();

      const { error } = await s.family.client.rpc('family_mark_student_absent', { p_student_id: s.studentId });
      expect(error).toBeNull();
      const { data } = await adminClient.from('students').select('status').eq('id', s.studentId).single();
      expect(data.status).toBe('absent');

      await adminClient.from('students').update({ status: 'in_school' }).eq('id', s.studentId);
      const { error: lateErr } = await s.family.client.rpc('family_mark_student_absent', { p_student_id: s.studentId });
      expect(lateErr).not.toBeNull();
      const { data: after } = await adminClient.from('students').select('status').eq('id', s.studentId).single();
      expect(after.status).toBe('in_school');
    } finally {
      await deleteTestUser(other.id);
      await cleanup(s);
    }
  }, 25000);

  it('admin e gestão continuam editando horário contratado e isenção', async () => {
    const s = await setupFamilyStudent();
    const admin = await createTestUser({ role: 'admin', schoolId: s.schoolId });
    try {
      const { error } = await admin.client.from('students').update({ contracted_exit_time: '15:00', isento_hora_extra: true }).eq('id', s.studentId);
      expect(error).toBeNull();
      const { data } = await adminClient.from('students').select('isento_hora_extra, contracted_exit_time').eq('id', s.studentId).single();
      expect(data.isento_hora_extra).toBe(true);
      expect(data.contracted_exit_time).toBe('15:00:00');
    } finally {
      await cleanup(s, [admin]);
    }
  }, 20000);
});

runIf('Segurança · item 11: cadastro pendente não tem acesso até a escola aprovar', () => {
  it('família pendente fica sem papel no banco; ao ser aprovada, ganha o papel family', async () => {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId, extra: { status: 'pending' } });
    const admin = await createTestUser({ role: 'admin', schoolId });
    try {
      const { data: pendingRole } = await family.client.rpc('get_my_role');
      expect(pendingRole).toBeNull();

      // Hierarquia (Fase 3): o admin não aprova; só a Gestão.
      const { error: adminApproveErr } = await admin.client.from('users').update({ status: 'active' }).eq('id', family.id);
      expect(adminApproveErr).not.toBeNull();
      const gestao = await createTestUser({ role: 'gestao', schoolId });
      const { error: approveErr } = await gestao.client.from('users').update({ status: 'active' }).eq('id', family.id);
      await deleteTestUser(gestao.id);
      expect(approveErr).toBeNull();
      const { data: activeRole } = await family.client.rpc('get_my_role');
      expect(activeRole).toBe('family');
    } finally {
      await deleteTestUser(family.id);
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  }, 20000);

  it('família pendente também não mexe em cobrança do próprio filho (trava do item 5 não depende do papel ativo)', async () => {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId, extra: { status: 'pending' } });
    const { data: student } = await adminClient.from('students')
      .insert({ school_id: schoolId, family_id: family.id, name: 'Vitest Pendente Aluno', turma: 'Nido', isento_hora_extra: false })
      .select('id').single();
    try {
      await family.client.from('students').update({ isento_hora_extra: true }).eq('id', student.id);
      const { data } = await adminClient.from('students').select('isento_hora_extra').eq('id', student.id).single();
      expect(data.isento_hora_extra).toBe(false);
    } finally {
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 20000);
});

runIf('Segurança · vínculo de responsável (student_guardians)', () => {
  async function setupTwoFamilies() {
    const schoolId = await createTestSchool();
    const owner = await createTestUser({ role: 'family', schoolId });
    const second = await createTestUser({ role: 'family', schoolId });
    const stranger = await createTestUser({ role: 'family', schoolId });
    const { data: student, error } = await adminClient.from('students')
      .insert({ school_id: schoolId, family_id: owner.id, name: 'Vitest Vínculo Aluno', turma: 'Nido' })
      .select('id').single();
    if (error) throw error;
    await adminClient.from('student_guardians').insert([
      { student_id: student.id, guardian_id: owner.id, school_id: schoolId, is_primary: true, is_financial: true, relationship: 'Responsável Financeiro' },
      { student_id: student.id, guardian_id: second.id, school_id: schoolId, is_primary: false, is_financial: false, relationship: 'Segundo Responsável' },
    ]);
    return { schoolId, owner, second, stranger, studentId: student.id };
  }
  async function cleanup(s) {
    await adminClient.from('student_guardians').delete().eq('student_id', s.studentId);
    await adminClient.from('students').delete().eq('id', s.studentId);
    for (const u of [s.owner, s.second, s.stranger]) await deleteTestUser(u.id);
    await deleteTestSchool(s.schoolId);
  }

  it('família NÃO se vincula como responsável de um aluno que não é dela', async () => {
    const s = await setupTwoFamilies();
    try {
      await s.stranger.client.from('student_guardians').insert({
        student_id: s.studentId, guardian_id: s.stranger.id, school_id: s.schoolId, is_primary: false, is_financial: false, relationship: 'Invasor',
      });
      const { data: links } = await adminClient.from('student_guardians').select('guardian_id').eq('student_id', s.studentId).eq('guardian_id', s.stranger.id);
      expect(links).toEqual([]);
      const { data: canRead } = await s.stranger.client.from('students').select('id').eq('id', s.studentId);
      expect(canRead).toEqual([]);
    } finally {
      await cleanup(s);
    }
  }, 25000);

  it('2º responsável NÃO se promove a responsável financeiro', async () => {
    const s = await setupTwoFamilies();
    try {
      await s.second.client.from('student_guardians').update({ is_financial: true, is_primary: true }).eq('guardian_id', s.second.id);
      const { data } = await adminClient.from('student_guardians').select('is_financial, is_primary').eq('student_id', s.studentId).eq('guardian_id', s.second.id).single();
      expect(data.is_financial).toBe(false);
      expect(data.is_primary).toBe(false);
    } finally {
      await cleanup(s);
    }
  }, 25000);

  it('fluxo normal continua: titular vê os vínculos e remove o 2º responsável dos próprios filhos', async () => {
    const s = await setupTwoFamilies();
    try {
      const { data: visible } = await s.owner.client.from('student_guardians').select('guardian_id').eq('student_id', s.studentId);
      expect(visible).toHaveLength(2);
      const { error } = await s.owner.client.from('student_guardians').delete().eq('guardian_id', s.second.id).in('student_id', [s.studentId]);
      expect(error).toBeNull();
      const { data: remaining } = await adminClient.from('student_guardians').select('guardian_id').eq('student_id', s.studentId);
      expect(remaining.map(r => r.guardian_id)).toEqual([s.owner.id]);
    } finally {
      await cleanup(s);
    }
  }, 25000);
});

runIf('Segurança · item 7: biometria facial fora do alcance do professor', () => {
  const FAKE_DESCRIPTOR = JSON.stringify(Array.from({ length: 128 }, (_, i) => i / 1000));

  async function setupBiometry() {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId });
    const teacher = await createTestUser({ role: 'teacher', schoolId, extra: { teacher_status: 'ativo', turmas: ['Nido'] } });
    const otherTeacher = await createTestUser({ role: 'teacher', schoolId, extra: { teacher_status: 'ativo', turmas: ['Kids II'] } });
    const admin = await createTestUser({ role: 'admin', schoolId });
    const { data: student } = await adminClient.from('students')
      .insert({ school_id: schoolId, family_id: family.id, name: 'Vitest Biometria Aluno', turma: 'Nido' }).select('id').single();
    const { data: person, error } = await adminClient.from('authorized_persons')
      .insert({ school_id: schoolId, family_id: family.id, name: 'Vitest Avó', relation: 'Avó', has_photo: true, face_descriptor: FAKE_DESCRIPTOR, emergency_order: 2 })
      .select('id').single();
    if (error) throw error;
    const photoPath = `${schoolId}/${person.id}.jpg`;
    await adminClient.storage.from('person-photos').upload(photoPath, new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' }), { upsert: true });
    await adminClient.from('authorized_persons').update({ photo_storage_path: photoPath }).eq('id', person.id);
    return { schoolId, family, teacher, otherTeacher, admin, studentId: student.id, personId: person.id, photoPath };
  }
  async function cleanup(s) {
    await adminClient.storage.from('person-photos').remove([s.photoPath]);
    await adminClient.from('authorized_persons').delete().eq('id', s.personId);
    await adminClient.from('students').delete().eq('id', s.studentId);
    for (const u of [s.family, s.teacher, s.otherTeacher, s.admin]) await deleteTestUser(u.id);
    await deleteTestSchool(s.schoolId);
  }

  it('professor NÃO lê o descritor facial dos responsáveis da própria turma', async () => {
    const s = await setupBiometry();
    try {
      const { data } = await s.teacher.client.from('authorized_persons').select('id, face_descriptor').eq('id', s.personId);
      expect((data || []).filter(r => r.face_descriptor)).toEqual([]);
    } finally {
      await cleanup(s);
    }
  }, 30000);

  it('professor continua vendo nome, foto e "tem biometria" das famílias da turma dele (e só delas)', async () => {
    const s = await setupBiometry();
    try {
      const { data, error } = await s.teacher.client.rpc('get_teacher_authorized_persons');
      expect(error).toBeNull();
      const row = data.find(r => r.id === s.personId);
      expect(row).toBeTruthy();
      expect(row.name).toBe('Vitest Avó');
      expect(row.has_biometrics).toBe(true);
      expect(row).not.toHaveProperty('face_descriptor');

      const { data: signed, error: signErr } = await s.teacher.client.storage.from('person-photos').createSignedUrl(s.photoPath, 60);
      expect(signErr).toBeNull();
      expect(signed?.signedUrl).toBeTruthy();

      const { data: otherData } = await s.otherTeacher.client.rpc('get_teacher_authorized_persons');
      expect((otherData || []).find(r => r.id === s.personId)).toBeUndefined();
      const { error: otherSignErr } = await s.otherTeacher.client.storage.from('person-photos').createSignedUrl(s.photoPath, 60);
      expect(otherSignErr).not.toBeNull();
    } finally {
      await cleanup(s);
    }
  }, 30000);

  it('caminho do totem intacto: admin continua lendo os descritores da escola', async () => {
    const s = await setupBiometry();
    try {
      const { data, error } = await s.admin.client.from('authorized_persons').select('id, face_descriptor').not('face_descriptor', 'is', null).eq('id', s.personId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].face_descriptor).toBe(FAKE_DESCRIPTOR);
    } finally {
      await cleanup(s);
    }
  }, 30000);
});

runIf('Segurança · acesso legado do totem (x-kiosk-token) removido', () => {
  it('nenhum token de totem legado continua ativo', async () => {
    const { data: active } = await adminClient.from('kiosk_devices').select('id').eq('is_active', true);
    expect(active).toEqual([]);
  }, 15000);
});
