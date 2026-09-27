import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';
import { calcularHorasExtras, calcularEntradaAntecipada } from '../utils/attendanceUtils.js';

// Correção de presença: "aumenta a cobrança?" vinha da TELA
// (p_increases_billing). Quem pedisse a correção decidia se ela ia pra
// aprovação da Gestão. Agora o servidor calcula sozinho, com a mesma regra
// do relatório de horas extras (attendanceUtils.js); a informação da tela
// só pode deixar mais rígido.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const BILLING = { early_checkin_tolerance_min: 10, late_checkout_tolerance_min: 15, hourly_rate_cents: 2500, charge_early_checkin: true };
const WEEKLY = { sexta: { entry: '08:00', exit: '12:00' } };

// 2026-09-21 = segunda, 2026-09-25 = sexta (override em WEEKLY)
const CASES = [
  ['exit', '2026-09-21T17:00:00-03:00'],
  ['exit', '2026-09-21T17:15:00-03:00'],
  ['exit', '2026-09-21T17:16:00-03:00'],
  ['exit', '2026-09-21T18:00:00-03:00'],
  ['exit', '2026-09-21T18:01:00-03:00'],
  ['exit', '2026-09-21T20:30:30-03:00'],
  ['exit', '2026-09-21T16:00:00-03:00'],
  ['exit', '2026-09-25T12:20:00-03:00'],
  ['entry', '2026-09-21T07:00:00-03:00'],
  ['entry', '2026-09-21T06:50:00-03:00'],
  ['entry', '2026-09-21T06:49:00-03:00'],
  ['entry', '2026-09-21T05:30:00-03:00'],
  ['entry', '2026-09-25T07:40:00-03:00'],
];

async function setup(extraStudent = {}) {
  const schoolId = await createTestSchool();
  await adminClient.from('schools').update({ billing_config: BILLING }).eq('id', schoolId);
  const family = await createTestUser({ role: 'family', schoolId });
  const { data: student, error } = await adminClient.from('students').insert({
    school_id: schoolId, family_id: family.id, name: 'Vitest Cobrança Correção', turma: 'Nido',
    contracted_entry_time: '07:00', contracted_exit_time: '17:00', weekly_schedule: WEEKLY, ...extraStudent,
  }).select('*').single();
  if (error) throw error;
  return { schoolId, family, student };
}

runIf('Correção de presença · cobrança calculada no servidor', () => {
  it('o cálculo do banco dá exatamente o mesmo valor do relatório de horas extras (tela)', async () => {
    const s = await setup();
    try {
      for (const [type, when] of CASES) {
        const iso = new Date(when).toISOString();
        const js = type === 'exit'
          ? calcularHorasExtras(iso, s.student.contracted_exit_time, WEEKLY, BILLING, false)
          : calcularEntradaAntecipada(iso, s.student.contracted_entry_time, WEEKLY, BILLING, false);
        const { data: cents, error } = await adminClient.rpc('attendance_charge_cents', { p_student_id: s.student.id, p_event_type: type, p_event_time: iso });
        expect(error).toBeNull();
        expect(cents, `${type} ${when}`).toBe(Math.round(js.valor * 100));
      }
    } finally {
      await adminClient.from('students').delete().eq('id', s.student.id);
      await deleteTestUser(s.family.id);
      await deleteTestSchool(s.schoolId);
    }
  }, 60000);

  it('aluno isento nunca gera cobrança no cálculo do banco', async () => {
    const s = await setup({ isento_hora_extra: true });
    try {
      const { data } = await adminClient.rpc('attendance_charge_cents', { p_student_id: s.student.id, p_event_type: 'exit', p_event_time: new Date('2026-09-21T20:00:00-03:00').toISOString() });
      expect(data).toBe(0);
    } finally {
      await adminClient.from('students').delete().eq('id', s.student.id);
      await deleteTestUser(s.family.id);
      await deleteTestSchool(s.schoolId);
    }
  }, 30000);

  it('tela diz "não aumenta", mas a correção aumenta a cobrança: vai pra aprovação, não aplica na hora', async () => {
    const s = await setup();
    const admin = await createTestUser({ role: 'admin', schoolId: s.schoolId });
    const original = new Date('2026-09-21T17:00:00-03:00').toISOString();
    const { data: log } = await adminClient.from('attendance_logs')
      .insert({ school_id: s.schoolId, student_id: s.student.id, family_id: s.family.id, event_type: 'exit', event_time: original })
      .select('id').single();
    try {
      const { data, error } = await admin.client.rpc('request_attendance_correction', {
        p_log_id: log.id, p_new_event_time: new Date('2026-09-21T19:00:00-03:00').toISOString(),
        p_reason_code: 'x', p_reason_detail: null, p_minutes_delta: 0, p_increases_billing: false,
      });
      expect(error).toBeNull();
      expect(data.status).toBe('pending');
      const { data: after } = await adminClient.from('attendance_logs').select('event_time').eq('id', log.id).single();
      expect(new Date(after.event_time).toISOString()).toBe(original);
    } finally {
      await adminClient.from('attendance_corrections').delete().eq('student_id', s.student.id);
      await adminClient.from('attendance_logs').delete().eq('student_id', s.student.id);
      await adminClient.from('students').delete().eq('id', s.student.id);
      await deleteTestUser(admin.id);
      await deleteTestUser(s.family.id);
      await deleteTestSchool(s.schoolId);
    }
  }, 30000);

  it('correção que realmente não aumenta a cobrança continua sendo aplicada na hora', async () => {
    const s = await setup();
    const admin = await createTestUser({ role: 'admin', schoolId: s.schoolId });
    const { data: log } = await adminClient.from('attendance_logs')
      .insert({ school_id: s.schoolId, student_id: s.student.id, family_id: s.family.id, event_type: 'exit', event_time: new Date('2026-09-21T19:00:00-03:00').toISOString() })
      .select('id').single();
    try {
      const earlier = new Date('2026-09-21T17:05:00-03:00').toISOString();
      const { data, error } = await admin.client.rpc('request_attendance_correction', {
        p_log_id: log.id, p_new_event_time: earlier, p_reason_code: 'x', p_reason_detail: null, p_minutes_delta: -115, p_increases_billing: false,
      });
      expect(error).toBeNull();
      expect(data.status).toBe('applied');
      const { data: after } = await adminClient.from('attendance_logs').select('event_time').eq('id', log.id).single();
      expect(new Date(after.event_time).toISOString()).toBe(earlier);
    } finally {
      await adminClient.from('attendance_corrections').delete().eq('student_id', s.student.id);
      await adminClient.from('attendance_logs').delete().eq('student_id', s.student.id);
      await adminClient.from('students').delete().eq('id', s.student.id);
      await deleteTestUser(admin.id);
      await deleteTestUser(s.family.id);
      await deleteTestSchool(s.schoolId);
    }
  }, 30000);

  it('lançamento manual de saída com hora extra vai pra aprovação mesmo com a tela dizendo o contrário', async () => {
    const s = await setup();
    const admin = await createTestUser({ role: 'admin', schoolId: s.schoolId });
    try {
      const { data, error } = await admin.client.rpc('request_attendance_manual_entry', {
        p_student_id: s.student.id, p_event_type: 'exit', p_new_event_time: new Date('2026-09-21T19:30:00-03:00').toISOString(),
        p_reason_code: 'x', p_reason_detail: null, p_minutes_delta: 0, p_increases_billing: false,
      });
      expect(error).toBeNull();
      expect(data.status).toBe('pending');
      const { data: logs } = await adminClient.from('attendance_logs').select('id').eq('student_id', s.student.id);
      expect(logs).toEqual([]);
    } finally {
      await adminClient.from('attendance_corrections').delete().eq('student_id', s.student.id);
      await adminClient.from('attendance_logs').delete().eq('student_id', s.student.id);
      await adminClient.from('students').delete().eq('id', s.student.id);
      await deleteTestUser(admin.id);
      await deleteTestUser(s.family.id);
      await deleteTestSchool(s.schoolId);
    }
  }, 30000);
});
