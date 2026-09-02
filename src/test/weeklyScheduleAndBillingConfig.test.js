import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Horários personalizados por dia (students.weekly_schedule) + config de
// cobrança por escola (schools.billing_config) -- permissão restrita a
// admin principal/developer, validação de formato no banco.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Horários personalizados por dia (students.weekly_schedule)', () => {
  it('admin principal configura; admin comum e família são bloqueados (nada muda)', async () => {
    const school = await createTestSchool();
    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });
    const regularAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: false } });
    const family = await createTestUser({ role: 'family', schoolId: school });
    const { data: student } = await adminClient.from('students').insert({ name: 'Aluno Vitest', school_id: school, family_id: family.id }).select('id').single();

    try {
      let r = await regularAdmin.client.from('students').update({ weekly_schedule: { segunda: { entry: '06:00', exit: '17:00' } } }).eq('id', student.id).select();
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('admin principal');

      r = await family.client.from('students').update({ weekly_schedule: { segunda: { entry: '06:00', exit: '17:00' } } }).eq('id', student.id).select();
      expect(r.error).toBeTruthy();

      const { data: unchanged } = await adminClient.from('students').select('weekly_schedule').eq('id', student.id).single();
      expect(unchanged.weekly_schedule).toEqual({});

      r = await primaryAdmin.client.from('students').update({ weekly_schedule: { segunda: { entry: '06:00', exit: '17:00' } } }).eq('id', student.id).select();
      expect(r.error).toBeNull();

      const { data: saved } = await adminClient.from('students').select('weekly_schedule').eq('id', student.id).single();
      expect(saved.weekly_schedule).toEqual({ segunda: { entry: '06:00', exit: '17:00' } });
    } finally {
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(primaryAdmin.id);
      await deleteTestUser(regularAdmin.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  }, 20000);

  it('rejeita formato/faixa inválidos: entrada depois da saída, horário malformado, chave de dia inválida, override incompleto', async () => {
    const school = await createTestSchool();
    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });
    const family = await createTestUser({ role: 'family', schoolId: school });
    const { data: student } = await adminClient.from('students').insert({ name: 'Aluno Vitest', school_id: school, family_id: family.id }).select('id').single();

    try {
      let r = await primaryAdmin.client.from('students').update({ weekly_schedule: { segunda: { entry: '17:00', exit: '07:00' } } }).eq('id', student.id);
      expect(r.error).toBeTruthy();

      r = await primaryAdmin.client.from('students').update({ weekly_schedule: { segunda: { entry: '25:00', exit: '17:00' } } }).eq('id', student.id);
      expect(r.error).toBeTruthy();

      r = await primaryAdmin.client.from('students').update({ weekly_schedule: { feriado: { entry: '07:00', exit: '17:00' } } }).eq('id', student.id);
      expect(r.error).toBeTruthy();

      r = await primaryAdmin.client.from('students').update({ weekly_schedule: { segunda: { entry: '07:00' } } }).eq('id', student.id);
      expect(r.error).toBeTruthy();
    } finally {
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(primaryAdmin.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  }, 20000);

  it('bloqueia INSERT de aluno já com weekly_schedule preenchido por quem não é admin principal', async () => {
    const school = await createTestSchool();
    const regularAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: false } });
    const family = await createTestUser({ role: 'family', schoolId: school });

    try {
      const r = await regularAdmin.client.from('students').insert({ name: 'Aluno Novo', school_id: school, family_id: family.id, weekly_schedule: { segunda: { entry: '06:00', exit: '17:00' } } }).select();
      expect(r.error).toBeTruthy();
    } finally {
      await deleteTestUser(regularAdmin.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  }, 15000);
});

runIf('Config de cobrança por escola (schools.billing_config)', () => {
  it('admin principal configura; admin comum é bloqueado', async () => {
    const school = await createTestSchool();
    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });
    const regularAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: false } });

    try {
      let r = await primaryAdmin.client.from('schools').update({ billing_config: { early_checkin_tolerance_min: 10, late_checkout_tolerance_min: 20, hourly_rate_cents: 4000, charge_early_checkin: false } }).eq('id', school).select();
      expect(r.error).toBeNull();

      const { data: saved } = await adminClient.from('schools').select('billing_config').eq('id', school).single();
      expect(saved.billing_config).toEqual({ early_checkin_tolerance_min: 10, late_checkout_tolerance_min: 20, hourly_rate_cents: 4000, charge_early_checkin: false });

      r = await regularAdmin.client.from('schools').update({ billing_config: { hourly_rate_cents: 1 } }).eq('id', school).select();
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('admin principal');
    } finally {
      await deleteTestUser(primaryAdmin.id);
      await deleteTestUser(regularAdmin.id);
      await deleteTestSchool(school);
    }
  }, 20000);

  it('rejeita valor fora da faixa e chave desconhecida', async () => {
    const school = await createTestSchool();
    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });

    try {
      let r = await primaryAdmin.client.from('schools').update({ billing_config: { hourly_rate_cents: -1 } }).eq('id', school);
      expect(r.error).toBeTruthy();

      r = await primaryAdmin.client.from('schools').update({ billing_config: { early_checkin_tolerance_min: 999 } }).eq('id', school);
      expect(r.error).toBeTruthy();

      r = await primaryAdmin.client.from('schools').update({ billing_config: { chave_desconhecida: 1 } }).eq('id', school);
      expect(r.error).toBeTruthy();
    } finally {
      await deleteTestUser(primaryAdmin.id);
      await deleteTestSchool(school);
    }
  }, 20000);
});
