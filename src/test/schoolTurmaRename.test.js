import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Renomear turma com propagação (rename_school_turma) -- corrige um erro de
// digitação numa turma sem precisar remover (o que seria bloqueado se
// estivesse em uso) e sem deixar registros órfãos em nenhuma tabela.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Renomear turma com propagação (rename_school_turma)', () => {
  it('admin principal renomeia e a mudança se propaga por todas as tabelas; admin comum, professor e família são bloqueados', async () => {
    const school = await createTestSchool();
    await adminClient.from('schools').update({ turmas: ['Kids I', 'Kids II'] }).eq('id', school);

    const primaryAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: true } });
    const regularAdmin = await createTestUser({ role: 'admin', schoolId: school, extra: { is_primary_admin: false } });
    const teacher = await createTestUser({ role: 'teacher', schoolId: school, extra: { turmas: ['Kids I'] } });
    const family = await createTestUser({ role: 'family', schoolId: school });
    const { data: student } = await adminClient.from('students').insert({ name: 'Aluno Vitest', school_id: school, family_id: family.id, turma: 'Kids I' }).select('id').single();
    const { data: mural } = await adminClient.from('mural_fotos').insert({ school_id: school, turmas: ['Kids I'], storage_path: 'vitest/x.jpg', uploaded_by: primaryAdmin.id }).select('id').single();
    const { data: comunicado } = await adminClient.from('comunicados').insert({ school_id: school, turmas: ['Kids I'], title: 'Vitest', body: 'Vitest', created_by: primaryAdmin.id }).select('id').single();
    const { data: subjectRow } = await adminClient.from('subjects').insert({ school_id: school, name: 'Vitest Matéria' }).select('id').single();
    const { data: subject } = await adminClient.from('class_subjects').insert({ school_id: school, class_name: 'Kids I', subject_id: subjectRow.id }).select('id').single();
    const { data: attendance } = await adminClient.from('class_attendance').insert({ school_id: school, class_name: 'Kids I', date: '2026-01-01', status: 'presente', student_id: student.id }).select('id').single();

    try {
      let r = await regularAdmin.client.rpc('rename_school_turma', { p_old_name: 'Kids I', p_new_name: 'Kids I Corrigido' });
      expect(r.error).toBeTruthy();

      r = await teacher.client.rpc('rename_school_turma', { p_old_name: 'Kids I', p_new_name: 'Kids I Corrigido' });
      expect(r.error).toBeTruthy();

      r = await family.client.rpc('rename_school_turma', { p_old_name: 'Kids I', p_new_name: 'Kids I Corrigido' });
      expect(r.error).toBeTruthy();

      // Nada mudou pelas tentativas bloqueadas.
      const { data: unchangedAttendance } = await adminClient.from('class_attendance').select('class_name').eq('id', attendance.id).single();
      expect(unchangedAttendance.class_name).toBe('Kids I');

      // Renomear pra um nome já existente é bloqueado.
      r = await primaryAdmin.client.rpc('rename_school_turma', { p_old_name: 'Kids I', p_new_name: 'Kids II' });
      expect(r.error).toBeTruthy();

      // Renomear turma inexistente é bloqueado.
      r = await primaryAdmin.client.rpc('rename_school_turma', { p_old_name: 'Turma Fantasma', p_new_name: 'X' });
      expect(r.error).toBeTruthy();

      // Admin principal renomeia com sucesso.
      r = await primaryAdmin.client.rpc('rename_school_turma', { p_old_name: 'Kids I', p_new_name: 'Kids I Corrigido' });
      expect(r.error).toBeNull();
      expect(r.data.turmas).toEqual(['Kids I Corrigido', 'Kids II']);

      // Propagação em todas as tabelas referenciadas.
      const { data: schoolRow } = await adminClient.from('schools').select('turmas').eq('id', school).single();
      expect(schoolRow.turmas).toEqual(['Kids I Corrigido', 'Kids II']);

      const { data: studentRow } = await adminClient.from('students').select('turma').eq('id', student.id).single();
      expect(studentRow.turma).toBe('Kids I Corrigido');

      const { data: teacherRow } = await adminClient.from('users').select('turmas').eq('id', teacher.id).single();
      expect(teacherRow.turmas).toEqual(['Kids I Corrigido']);

      const { data: muralRow } = await adminClient.from('mural_fotos').select('turmas').eq('id', mural.id).single();
      expect(muralRow.turmas).toEqual(['Kids I Corrigido']);

      const { data: comunicadoRow } = await adminClient.from('comunicados').select('turmas').eq('id', comunicado.id).single();
      expect(comunicadoRow.turmas).toEqual(['Kids I Corrigido']);

      const { data: subjectLinkRow } = await adminClient.from('class_subjects').select('class_name').eq('id', subject.id).single();
      expect(subjectLinkRow.class_name).toBe('Kids I Corrigido');

      const { data: attendanceRow } = await adminClient.from('class_attendance').select('class_name, class_id').eq('id', attendance.id).single();
      expect(attendanceRow.class_name).toBe('Kids I Corrigido');

      // classes normalizada também rebatizada, sem duplicar a linha (mesmo id).
      const { data: classesRows } = await adminClient.from('classes').select('id, name').eq('school_id', school);
      expect(classesRows.filter(c => c.name === 'Kids I' || c.name === 'Kids I Corrigido')).toHaveLength(1);
      expect(classesRows.find(c => c.name === 'Kids I Corrigido').id).toBe(attendanceRow.class_id);
    } finally {
      await adminClient.from('class_attendance').delete().eq('id', attendance.id);
      await adminClient.from('class_subjects').delete().eq('id', subject.id);
      await adminClient.from('subjects').delete().eq('id', subjectRow.id);
      await adminClient.from('comunicados').delete().eq('id', comunicado.id);
      await adminClient.from('mural_fotos').delete().eq('id', mural.id);
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(primaryAdmin.id);
      await deleteTestUser(regularAdmin.id);
      await deleteTestUser(teacher.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(school);
    }
  }, 25000);

  it('isolamento multi-tenant: renomear na escola A não afeta a escola B', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    await adminClient.from('schools').update({ turmas: ['Nido'] }).eq('id', schoolA);
    await adminClient.from('schools').update({ turmas: ['Nido'] }).eq('id', schoolB);

    const primaryAdminA = await createTestUser({ role: 'admin', schoolId: schoolA, extra: { is_primary_admin: true } });

    try {
      const r = await primaryAdminA.client.rpc('rename_school_turma', { p_old_name: 'Nido', p_new_name: 'Berçário' });
      expect(r.error).toBeNull();

      const { data: schoolBRow } = await adminClient.from('schools').select('turmas').eq('id', schoolB).single();
      expect(schoolBRow.turmas).toEqual(['Nido']);
    } finally {
      await deleteTestUser(primaryAdminA.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  }, 20000);
});
