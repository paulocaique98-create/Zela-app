import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Gestão de turmas pela própria escola (update_school_turmas RPC) --
// permissão restrita ao admin principal (ou developer), com validação de
// uso antes de permitir remover/renomear uma turma.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Gestão de turmas pela escola (update_school_turmas)', () => {
  it('admin principal pode adicionar e remover turma não usada; admin comum, professor e família são bloqueados', async () => {
    const school = await createTestSchool();
    await adminClient.from('schools').update({ turmas: ['Nido', 'Kids I'] }).eq('id', school);

    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });
    const regularAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: false } });
    const teacher = await createTestUser({ role: 'teacher', schoolId: school });
    const family = await createTestUser({ role: 'family', schoolId: school });

    try {
      let r = await regularAdmin.client.rpc('update_school_turmas', { p_turmas: ['Nido', 'Kids I', 'Kids II'] });
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('admin principal');

      r = await teacher.client.rpc('update_school_turmas', { p_turmas: ['Nido', 'Kids I', 'Kids II'] });
      expect(r.error).toBeTruthy();

      r = await family.client.rpc('update_school_turmas', { p_turmas: ['Nido', 'Kids I', 'Kids II'] });
      expect(r.error).toBeTruthy();

      // Confirma que nada foi alterado por essas tentativas bloqueadas.
      const { data: unchanged } = await adminClient.from('schools').select('turmas').eq('id', school).single();
      expect(unchanged.turmas).toEqual(['Nido', 'Kids I']);

      // Admin principal adiciona uma turma nova, com espaço/duplicata sobrando.
      r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Nido', 'Kids I', ' Kids II ', 'Kids II'] });
      expect(r.error).toBeNull();
      expect(r.data.turmas).toEqual(['Nido', 'Kids I', 'Kids II']);

      // Admin principal remove uma turma nunca usada.
      r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Nido', 'Kids I'] });
      expect(r.error).toBeNull();
      expect(r.data.turmas).toEqual(['Nido', 'Kids I']);
    } finally {
      await deleteTestUser(primaryAdmin.id);
      await deleteTestUser(regularAdmin.id);
      await deleteTestUser(teacher.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  }, 20000);

  it('bloqueia remover/renomear turma em uso (aluno, professor, mural, comunicado, matéria, frequência)', async () => {
    const school = await createTestSchool();
    await adminClient.from('schools').update({ turmas: ['Turma A', 'Turma B', 'Turma C', 'Turma D', 'Turma E', 'Turma F'] }).eq('id', school);

    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });
    const family = await createTestUser({ role: 'family', schoolId: school });
    const teacherInTurma = await createTestUser({ role: 'teacher', schoolId: school, extra: { turmas: ['Turma B'] } });
    const { data: student } = await adminClient.from('students').insert({ name: 'Aluno Vitest', school_id: school, family_id: family.id, turma: 'Turma A' }).select('id').single();
    const { data: mural } = await adminClient.from('mural_fotos').insert({ school_id: school, turmas: ['Turma C'], storage_path: 'vitest/fake.jpg', uploaded_by: primaryAdmin.id }).select('id').single();
    const { data: comunicado } = await adminClient.from('comunicados').insert({ school_id: school, turmas: ['Turma D'], title: 'Vitest', body: 'Vitest', created_by: primaryAdmin.id }).select('id').single();
    const { data: subjectRow } = await adminClient.from('subjects').insert({ school_id: school, name: 'Vitest Matéria' }).select('id').single();
    const { data: subject } = await adminClient.from('class_subjects').insert({ school_id: school, class_name: 'Turma E', subject_id: subjectRow.id }).select('id').single();
    const { data: attendance } = await adminClient.from('class_attendance').insert({ school_id: school, class_name: 'Turma F', date: '2026-01-01', status: 'presente', student_id: student.id }).select('id').single();

    try {
      let r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Turma B', 'Turma C', 'Turma D', 'Turma E', 'Turma F'] });
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('Turma A');

      r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Turma A', 'Turma C', 'Turma D', 'Turma E', 'Turma F'] });
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('Turma B');

      r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Turma A', 'Turma B', 'Turma D', 'Turma E', 'Turma F'] });
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('Turma C');

      r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Turma A', 'Turma B', 'Turma C', 'Turma E', 'Turma F'] });
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('Turma D');

      r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Turma A', 'Turma B', 'Turma C', 'Turma D', 'Turma F'] });
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('Turma E');

      r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Turma A', 'Turma B', 'Turma C', 'Turma D', 'Turma E'] });
      expect(r.error).toBeTruthy();
      expect(r.error.message).toContain('Turma F');

      // Turma nunca usada continua livre pra remover.
      r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Turma A', 'Turma B', 'Turma C', 'Turma D', 'Turma E', 'Turma F', 'Turma Livre'] });
      expect(r.error).toBeNull();
      r = await primaryAdmin.client.rpc('update_school_turmas', { p_turmas: ['Turma A', 'Turma B', 'Turma C', 'Turma D', 'Turma E', 'Turma F'] });
      expect(r.error).toBeNull();
    } finally {
      await adminClient.from('class_attendance').delete().eq('id', attendance.id);
      await adminClient.from('class_subjects').delete().eq('id', subject.id);
      await adminClient.from('subjects').delete().eq('id', subjectRow.id);
      await adminClient.from('comunicados').delete().eq('id', comunicado.id);
      await adminClient.from('mural_fotos').delete().eq('id', mural.id);
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(primaryAdmin.id);
      await deleteTestUser(family.id);
      await deleteTestUser(teacherInTurma.id);
      await deleteTestSchool(school);
    }
  }, 20000);

  it('developer pode gerenciar turmas de qualquer escola; isolamento multi-tenant entre escolas diferentes', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    await adminClient.from('schools').update({ turmas: ['Nido'] }).eq('id', schoolA);
    await adminClient.from('schools').update({ turmas: ['Berçário'] }).eq('id', schoolB);

    const developer = await createTestUser({ role: 'developer', schoolId: null });
    const primaryAdminB = await createTestUser({ role: 'admin', schoolId: schoolB, extra: { is_primary_admin: true } });

    try {
      // Admin principal da escola B não afeta a escola A.
      let r = await primaryAdminB.client.rpc('update_school_turmas', { p_turmas: ['Berçário', 'Kids I'] });
      expect(r.error).toBeNull();
      const { data: schoolARow } = await adminClient.from('schools').select('turmas').eq('id', schoolA).single();
      expect(schoolARow.turmas).toEqual(['Nido']);

      // Developer, mesmo sem school_id próprio, opera sobre a escola que
      // edita via schools.turmas direto (RPC exige get_my_school_id() do
      // chamador -- developer não tem escola, então a via legítima pra ele
      // continua sendo o UPDATE direto que já usava antes, não a RPC).
      const { error: devDirectError } = await developer.client.from('schools').update({ turmas: ['Nido', 'Kids I'] }).eq('id', schoolA);
      expect(devDirectError).toBeNull();
      const { data: schoolARow2 } = await adminClient.from('schools').select('turmas').eq('id', schoolA).single();
      expect(schoolARow2.turmas).toEqual(['Nido', 'Kids I']);
    } finally {
      await deleteTestUser(developer.id);
      await deleteTestUser(primaryAdminB.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  }, 20000);
});
