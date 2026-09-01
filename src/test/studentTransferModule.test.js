import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// P3.2 (núcleo acadêmico) — Transferência de turma (recorte inicial de
// "rematrícula/transferência", ver METODO_PEDAGOGICO.md). RPC atômica
// transfer_student_class + auditoria em student_transfers.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Transferência de turma (transfer_student_class)', () => {
  async function setupStudent(schoolId, turma = 'Nido') {
    const { data, error } = await adminClient.from('students').insert({ school_id: schoolId, name: 'Vitest Transfer Aluno', turma }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  it('admin da própria escola transfere o aluno; log de auditoria é gravado com motivo', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const studentId = await setupStudent(schoolId);
    try {
      const { error } = await admin.client.rpc('transfer_student_class', { p_student_id: studentId, p_new_turma: 'Kids I', p_reason: 'Progressão de idade' });
      expect(error).toBeNull();

      const { data: student } = await adminClient.from('students').select('turma').eq('id', studentId).single();
      expect(student.turma).toBe('Kids I');

      const { data: log } = await adminClient.from('student_transfers').select('from_class_name, to_class_name, reason').eq('student_id', studentId).single();
      expect(log.from_class_name).toBe('Nido');
      expect(log.to_class_name).toBe('Kids I');
      expect(log.reason).toBe('Progressão de idade');
    } finally {
      await adminClient.from('student_transfers').delete().eq('student_id', studentId);
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  });

  it('CRÍTICO — admin de outra escola não consegue transferir aluno alheio', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const adminB = await createTestUser({ role: 'admin', schoolId: schoolB });
    const studentId = await setupStudent(schoolA);
    try {
      const { error } = await adminB.client.rpc('transfer_student_class', { p_student_id: studentId, p_new_turma: 'Kids I' });
      expect(error).not.toBeNull();

      const { data: unchanged } = await adminClient.from('students').select('turma').eq('id', studentId).single();
      expect(unchanged.turma).toBe('Nido');
    } finally {
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(adminB.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  });

  it('professor não consegue transferir aluno (só admin)', async () => {
    const schoolId = await createTestSchool();
    const teacher = await createTestUser({ role: 'teacher', schoolId, extra: { teacher_status: 'ativo', turmas: ['Nido'] } });
    const studentId = await setupStudent(schoolId);
    try {
      const { error } = await teacher.client.rpc('transfer_student_class', { p_student_id: studentId, p_new_turma: 'Kids I' });
      expect(error).not.toBeNull();
    } finally {
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(teacher.id);
      await deleteTestSchool(schoolId);
    }
  });

  it('família não consegue transferir o próprio filho', async () => {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId });
    const studentId = await setupStudent(schoolId);
    try {
      const { error } = await family.client.rpc('transfer_student_class', { p_student_id: studentId, p_new_turma: 'Kids I' });
      expect(error).not.toBeNull();
    } finally {
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  });

  it('transferir pra mesma turma retorna erro claro (não permite "transferência" nula)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const studentId = await setupStudent(schoolId);
    try {
      const { error } = await admin.client.rpc('transfer_student_class', { p_student_id: studentId, p_new_turma: 'Nido' });
      expect(error?.message).toMatch(/já está nesta turma/);
    } finally {
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  });

  it('admin lê o histórico de transferências da própria escola; admin de outra escola não lê', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const adminA = await createTestUser({ role: 'admin', schoolId: schoolA });
    const adminB = await createTestUser({ role: 'admin', schoolId: schoolB });
    const studentId = await setupStudent(schoolA);
    await adminA.client.rpc('transfer_student_class', { p_student_id: studentId, p_new_turma: 'Kids I' });
    try {
      const { data: ownRead } = await adminA.client.from('student_transfers').select('id').eq('student_id', studentId);
      expect(ownRead).toHaveLength(1);

      const { data: otherRead } = await adminB.client.from('student_transfers').select('id').eq('student_id', studentId);
      expect(otherRead).toEqual([]);
    } finally {
      await adminClient.from('student_transfers').delete().eq('student_id', studentId);
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(adminA.id);
      await deleteTestUser(adminB.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  });
});
