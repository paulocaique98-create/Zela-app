import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Horas adicionais por aluno, por dia da semana (students.extra_hours) --
// permissão restrita a admin principal/developer (protect_student_extra_hours)
// + validação de formato/faixa no banco (is_valid_extra_hours / CHECK constraint).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Horas adicionais por aluno (students.extra_hours)', () => {
  it('admin principal configura; admin comum e família são bloqueados (nada muda)', async () => {
    const school = await createTestSchool();
    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });
    const regularAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: false } });
    const family = await createTestUser({ role: 'family', schoolId: school });
    const { data: student } = await adminClient.from('students').insert({ name: 'Aluno Vitest', school_id: school, family_id: family.id, turma: 'Nido' }).select('id').single();

    try {
      let r = await regularAdmin.client.from('students').update({ extra_hours: { segunda: 2 } }).eq('id', student.id).select();
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('admin principal');

      r = await family.client.from('students').update({ extra_hours: { segunda: 2 } }).eq('id', student.id).select();
      expect(r.error).toBeTruthy();

      const { data: unchanged } = await adminClient.from('students').select('extra_hours').eq('id', student.id).single();
      expect(unchanged.extra_hours).toEqual({});

      r = await primaryAdmin.client.from('students').update({ extra_hours: { segunda: 2, quarta: 1.5 } }).eq('id', student.id).select();
      expect(r.error).toBeNull();

      const { data: saved } = await adminClient.from('students').select('extra_hours').eq('id', student.id).single();
      expect(saved.extra_hours).toEqual({ segunda: 2, quarta: 1.5 });

      // Editar outro campo sem tocar em extra_hours continua liberado pra admin comum (no-op na trigger).
      r = await regularAdmin.client.from('students').update({ name: 'Aluno Vitest Renomeado' }).eq('id', student.id).select();
      expect(r.error).toBeNull();
    } finally {
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(primaryAdmin.id);
      await deleteTestUser(regularAdmin.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  }, 20000);

  it('rejeita valores fora da faixa/formato válido: negativo, acima de 4h, granularidade < 30min, chave de dia inválida', async () => {
    const school = await createTestSchool();
    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });
    const family = await createTestUser({ role: 'family', schoolId: school });
    const { data: student } = await adminClient.from('students').insert({ name: 'Aluno Vitest', school_id: school, family_id: family.id }).select('id').single();

    try {
      let r = await primaryAdmin.client.from('students').update({ extra_hours: { segunda: -1 } }).eq('id', student.id);
      expect(r.error).toBeTruthy();

      r = await primaryAdmin.client.from('students').update({ extra_hours: { segunda: 5 } }).eq('id', student.id);
      expect(r.error).toBeTruthy();

      r = await primaryAdmin.client.from('students').update({ extra_hours: { segunda: 1.3 } }).eq('id', student.id);
      expect(r.error).toBeTruthy();

      r = await primaryAdmin.client.from('students').update({ extra_hours: { feriado: 1 } }).eq('id', student.id);
      expect(r.error).toBeTruthy();

      // Casos de borda válidos: 0.5h e 4h (máximo) devem passar.
      r = await primaryAdmin.client.from('students').update({ extra_hours: { segunda: 0.5, terca: 4 } }).eq('id', student.id).select();
      expect(r.error).toBeNull();
    } finally {
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(primaryAdmin.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  }, 20000);

  it('bloqueia INSERT de aluno já com extra_hours preenchido por quem não é admin principal', async () => {
    const school = await createTestSchool();
    const regularAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: false } });
    const family = await createTestUser({ role: 'family', schoolId: school });

    try {
      const r = await regularAdmin.client.from('students').insert({ name: 'Aluno Novo', school_id: school, family_id: family.id, extra_hours: { segunda: 1 } }).select();
      expect(r.error).toBeTruthy();
    } finally {
      await deleteTestUser(regularAdmin.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  }, 15000);

  it('isolamento multi-tenant: admin principal de outra escola não afeta o aluno', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const familyA = await createTestUser({ role: 'family', schoolId: schoolA });
    const primaryAdminB = await createTestUser({ role: 'admin', schoolId: schoolB, extra: { is_primary_admin: true } });
    const { data: student } = await adminClient.from('students').insert({ name: 'Aluno Escola A', school_id: schoolA, family_id: familyA.id }).select('id').single();

    try {
      const r = await primaryAdminB.client.from('students').update({ extra_hours: { segunda: 2 } }).eq('id', student.id).select();
      // RLS de students já escopa por school_id -- admin de outra escola não acha a linha (0 rows), sem erro.
      expect(r.data ?? []).toHaveLength(0);

      const { data: unchanged } = await adminClient.from('students').select('extra_hours').eq('id', student.id).single();
      expect(unchanged.extra_hours).toEqual({});
    } finally {
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(familyA.id);
      await deleteTestUser(primaryAdminB.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  }, 20000);
});
