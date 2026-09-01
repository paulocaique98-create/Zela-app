import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// P3.2 (núcleo acadêmico, destravado 2026-09-01) — Módulo de Matérias/
// Disciplinas: isolamento multi-tenant, permissões por role, e CRUD.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Módulo de Matérias/Disciplinas — permissões e isolamento', () => {
  let schoolA, schoolB, adminA, adminB, teacherA, teacherOutraTurma, familyA;
  let subjectA;

  beforeAll(async () => {
    schoolA = await createTestSchool('Vitest Subjects A');
    schoolB = await createTestSchool('Vitest Subjects B');
    await adminClient.from('schools').update({ turmas: ['Infantil I', 'Infantil II'] }).eq('id', schoolA);

    adminA = await createTestUser({ role: 'admin', schoolId: schoolA });
    adminB = await createTestUser({ role: 'admin', schoolId: schoolB });
    teacherA = await createTestUser({ role: 'teacher', schoolId: schoolA, extra: { teacher_status: 'ativo', turmas: ['Infantil I'] } });
    teacherOutraTurma = await createTestUser({ role: 'teacher', schoolId: schoolA, extra: { teacher_status: 'ativo', turmas: ['Infantil II'] } });
    familyA = await createTestUser({ role: 'family', schoolId: schoolA });

    const { data: subj, error } = await adminClient
      .from('subjects')
      .insert({ school_id: schoolA, name: 'Matemática Vitest', color: '#6366f1' })
      .select('id')
      .single();
    if (error) throw error;
    subjectA = subj.id;

    await adminClient.from('class_subjects').insert({ school_id: schoolA, subject_id: subjectA, class_name: 'Infantil I' });
  });

  afterAll(async () => {
    await adminClient.from('class_subjects').delete().eq('subject_id', subjectA);
    await adminClient.from('subjects').delete().eq('id', subjectA);
    await deleteTestUser(adminA.id);
    await deleteTestUser(adminB.id);
    await deleteTestUser(teacherA.id);
    await deleteTestUser(teacherOutraTurma.id);
    await deleteTestUser(familyA.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  });

  describe('isolamento multi-tenant', () => {
    it('admin da escola B não lê matérias da escola A', async () => {
      const { data } = await adminB.client.from('subjects').select('id').eq('id', subjectA);
      expect(data).toEqual([]);
    });

    it('admin da escola B não lê associações matéria-turma da escola A', async () => {
      const { data } = await adminB.client.from('class_subjects').select('id').eq('subject_id', subjectA);
      expect(data).toEqual([]);
    });

    it('admin da escola B não consegue criar matéria na escola A', async () => {
      const { error } = await adminB.client.from('subjects').insert({ school_id: schoolA, name: 'Invasão' });
      expect(error).not.toBeNull();
    });
  });

  describe('permissões por role', () => {
    it('admin da própria escola lê, cria, edita e apaga matérias (CRUD completo)', async () => {
      const { data: created, error: createErr } = await adminA.client
        .from('subjects').insert({ school_id: schoolA, name: 'Ciências Vitest' }).select('id').single();
      expect(createErr).toBeNull();

      const { data: updated, error: updateErr } = await adminA.client
        .from('subjects').update({ description: 'Editado' }).eq('id', created.id).select();
      expect(updateErr).toBeNull();
      expect(updated[0].description).toBe('Editado');

      const { error: deleteErr } = await adminA.client.from('subjects').delete().eq('id', created.id);
      expect(deleteErr).toBeNull();
      const { data: gone } = await adminClient.from('subjects').select('id').eq('id', created.id);
      expect(gone).toEqual([]);
    });

    it('professor lê matérias da própria escola (acesso legítimo, só leitura)', async () => {
      const { data } = await teacherA.client.from('subjects').select('id').eq('id', subjectA);
      expect(data).toHaveLength(1);
    });

    it('professor NÃO consegue criar/editar/apagar matéria', async () => {
      const { error: insertErr } = await teacherA.client.from('subjects').insert({ school_id: schoolA, name: 'Tentativa Professor' });
      expect(insertErr).not.toBeNull();

      const { data: updateData } = await teacherA.client.from('subjects').update({ name: 'Hackeado' }).eq('id', subjectA).select();
      expect(updateData ?? []).toEqual([]);
    });

    it('professor da turma associada lê a associação matéria-turma', async () => {
      const { data } = await teacherA.client.from('class_subjects').select('class_name').eq('subject_id', subjectA);
      expect(data).toHaveLength(1);
      expect(data[0].class_name).toBe('Infantil I');
    });

    it('professor de OUTRA turma (mesma escola) não vê a associação de uma turma que não é a dele', async () => {
      const { data } = await teacherOutraTurma.client.from('class_subjects').select('class_name').eq('subject_id', subjectA);
      expect(data).toEqual([]);
    });

    it('família não lê matérias nem associações (sem policy pra family nestas tabelas)', async () => {
      const subjectsRes = await familyA.client.from('subjects').select('id');
      expect(subjectsRes.data).toEqual([]);
      const assocRes = await familyA.client.from('class_subjects').select('id');
      expect(assocRes.data).toEqual([]);
    });
  });

  describe('integridade', () => {
    it('não permite duas matérias com o mesmo nome na mesma escola', async () => {
      const { error } = await adminA.client.from('subjects').insert({ school_id: schoolA, name: 'Matemática Vitest' });
      expect(error).not.toBeNull();
    });

    it('apagar a matéria remove as associações em cascata (ON DELETE CASCADE)', async () => {
      const { data: disposable } = await adminClient.from('subjects').insert({ school_id: schoolA, name: 'Descartável Vitest' }).select('id').single();
      await adminClient.from('class_subjects').insert({ school_id: schoolA, subject_id: disposable.id, class_name: 'Infantil I' });

      await adminClient.from('subjects').delete().eq('id', disposable.id);

      const { data: orphanCheck } = await adminClient.from('class_subjects').select('id').eq('subject_id', disposable.id);
      expect(orphanCheck).toEqual([]);
    });
  });
});
