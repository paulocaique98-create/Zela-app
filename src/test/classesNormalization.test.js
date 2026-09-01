import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Trilha B, Fase 1 — normalização de turmas (só class_subjects/
// class_attendance por enquanto). `classes` é alimentada
// automaticamente por trigger a partir de class_name — nenhum
// componente de frontend precisou mudar.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('classes (normalização, Fase 1) — trigger automática', () => {
  it('inserir com turma inédita cria a linha em classes automaticamente e preenche class_id', async () => {
    const schoolId = await createTestSchool();
    const { data: subject } = await adminClient.from('subjects').insert({ school_id: schoolId, name: 'Vitest Classes Subj' }).select('id').single();
    try {
      const { data: cs, error } = await adminClient
        .from('class_subjects')
        .insert({ school_id: schoolId, subject_id: subject.id, class_name: 'Turma Vitest Inédita' })
        .select().single();
      expect(error).toBeNull();
      expect(cs.class_id).not.toBeNull();

      const { data: cls } = await adminClient.from('classes').select('id, name').eq('id', cs.class_id).single();
      expect(cls.name).toBe('Turma Vitest Inédita');
    } finally {
      await adminClient.from('class_subjects').delete().eq('subject_id', subject.id);
      await adminClient.from('subjects').delete().eq('id', subject.id);
      await adminClient.from('classes').delete().eq('school_id', schoolId).eq('name', 'Turma Vitest Inédita');
      await deleteTestSchool(schoolId);
    }
  });

  it('a mesma turma usada em duas tabelas diferentes reaproveita o MESMO class_id, sem duplicar em classes', async () => {
    const schoolId = await createTestSchool();
    const { data: subject } = await adminClient.from('subjects').insert({ school_id: schoolId, name: 'Vitest Classes Subj 2' }).select('id').single();
    const { data: student } = await adminClient.from('students').insert({ school_id: schoolId, name: 'Vitest Classes Aluno', turma: 'Turma Vitest Compartilhada' }).select('id').single();
    try {
      const { data: cs } = await adminClient
        .from('class_subjects').insert({ school_id: schoolId, subject_id: subject.id, class_name: 'Turma Vitest Compartilhada' }).select().single();
      const { data: ca } = await adminClient
        .from('class_attendance').insert({ school_id: schoolId, student_id: student.id, class_name: 'Turma Vitest Compartilhada', date: '2026-09-01', status: 'presente' }).select().single();

      expect(cs.class_id).toBe(ca.class_id);

      const { data: allClasses } = await adminClient.from('classes').select('id').eq('school_id', schoolId).eq('name', 'Turma Vitest Compartilhada');
      expect(allClasses).toHaveLength(1);
    } finally {
      await adminClient.from('class_attendance').delete().eq('student_id', student.id);
      await adminClient.from('class_subjects').delete().eq('subject_id', subject.id);
      await adminClient.from('subjects').delete().eq('id', subject.id);
      await adminClient.from('students').delete().eq('id', student.id);
      await adminClient.from('classes').delete().eq('school_id', schoolId).eq('name', 'Turma Vitest Compartilhada');
      await deleteTestSchool(schoolId);
    }
  });

  it('isolamento multi-tenant: admin de outra escola não lê classes normalizadas de escola alheia', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const { data: subject } = await adminClient.from('subjects').insert({ school_id: schoolA, name: 'Vitest Classes Subj 3' }).select('id').single();
    const { data: cs } = await adminClient.from('class_subjects').insert({ school_id: schoolA, subject_id: subject.id, class_name: 'Turma Isolamento Vitest' }).select().single();
    const adminB = await createTestUser({ role: 'admin', schoolId: schoolB });
    try {
      const { data } = await adminB.client.from('classes').select('id').eq('id', cs.class_id);
      expect(data).toEqual([]);
    } finally {
      await deleteTestUser(adminB.id);
      await adminClient.from('class_subjects').delete().eq('subject_id', subject.id);
      await adminClient.from('subjects').delete().eq('id', subject.id);
      await adminClient.from('classes').delete().eq('id', cs.class_id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  });

  it('admin da própria escola lê classes normalizadas', async () => {
    const schoolId = await createTestSchool();
    const { data: subject } = await adminClient.from('subjects').insert({ school_id: schoolId, name: 'Vitest Classes Subj 4' }).select('id').single();
    const { data: cs } = await adminClient.from('class_subjects').insert({ school_id: schoolId, subject_id: subject.id, class_name: 'Turma Leitura Vitest' }).select().single();
    const admin = await createTestUser({ role: 'admin', schoolId });
    try {
      const { data } = await admin.client.from('classes').select('id, name').eq('id', cs.class_id);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('Turma Leitura Vitest');
    } finally {
      await deleteTestUser(admin.id);
      await adminClient.from('class_subjects').delete().eq('subject_id', subject.id);
      await adminClient.from('subjects').delete().eq('id', subject.id);
      await adminClient.from('classes').delete().eq('id', cs.class_id);
      await deleteTestSchool(schoolId);
    }
  });
});
