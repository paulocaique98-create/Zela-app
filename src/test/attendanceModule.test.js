import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// P3.2 (núcleo acadêmico) — Trilha A: frequência formal (class_attendance).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Frequência formal (class_attendance) — permissões e isolamento', () => {
  let schoolA, schoolB, adminA, teacherA, teacherOutraTurma, studentA;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    schoolA = await createTestSchool('Vitest Freq A');
    schoolB = await createTestSchool('Vitest Freq B');
    adminA = await createTestUser({ role: 'admin', schoolId: schoolA });
    teacherA = await createTestUser({ role: 'teacher', schoolId: schoolA, extra: { teacher_status: 'ativo', turmas: ['Infantil I'] } });
    teacherOutraTurma = await createTestUser({ role: 'teacher', schoolId: schoolA, extra: { teacher_status: 'ativo', turmas: ['Infantil II'] } });

    const { data: student, error } = await adminClient
      .from('students').insert({ name: 'Aluno Freq Vitest', school_id: schoolA, turma: 'Infantil I' }).select('id').single();
    if (error) throw error;
    studentA = student.id;
  });

  afterAll(async () => {
    await adminClient.from('class_attendance').delete().eq('student_id', studentA);
    await adminClient.from('students').delete().eq('id', studentA);
    await deleteTestUser(adminA.id);
    await deleteTestUser(teacherA.id);
    await deleteTestUser(teacherOutraTurma.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  });

  it('professor da turma marca presença (mesmo upsert usado por TeacherFrequencia.jsx)', async () => {
    const { data, error } = await teacherA.client
      .from('class_attendance')
      .upsert({ school_id: schoolA, student_id: studentA, class_name: 'Infantil I', date: today, status: 'presente', recorded_by: teacherA.id }, { onConflict: 'student_id,date' })
      .select().single();
    expect(error).toBeNull();
    expect(data.status).toBe('presente');
  });

  it('professor de OUTRA turma (mesma escola) não consegue marcar frequência de aluno que não é seu', async () => {
    const { data, error } = await teacherOutraTurma.client
      .from('class_attendance')
      .upsert({ school_id: schoolA, student_id: studentA, class_name: 'Infantil I', date: today, status: 'ausente', recorded_by: teacherOutraTurma.id }, { onConflict: 'student_id,date' })
      .select();
    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();
  });

  it('o mesmo professor consegue ATUALIZAR o próprio registro do dia (upsert idempotente, corrige status errado)', async () => {
    const { data, error } = await teacherA.client
      .from('class_attendance')
      .upsert({ school_id: schoolA, student_id: studentA, class_name: 'Infantil I', date: today, status: 'atrasado', recorded_by: teacherA.id }, { onConflict: 'student_id,date' })
      .select().single();
    expect(error).toBeNull();
    expect(data.status).toBe('atrasado');

    const { data: all } = await adminClient.from('class_attendance').select('id').eq('student_id', studentA).eq('date', today);
    expect(all).toHaveLength(1); // upsert corrigiu no lugar, não duplicou
  });

  it('admin da escola lê a frequência (mas não pode criar/editar -- mesmo padrão de pedagogical_records)', async () => {
    const { data } = await adminA.client.from('class_attendance').select('id, status').eq('student_id', studentA);
    expect(data).toHaveLength(1);

    const { data: insertAttempt, error: insertError } = await adminA.client
      .from('class_attendance').insert({ school_id: schoolA, student_id: studentA, class_name: 'Infantil I', date: '2020-01-01', status: 'presente' }).select();
    expect(insertAttempt ?? []).toEqual([]);
    expect(insertError).not.toBeNull();
  });

  it('admin de outra escola não lê nem escreve frequência da escola A', async () => {
    const adminB = await createTestUser({ role: 'admin', schoolId: schoolB });
    try {
      const { data } = await adminB.client.from('class_attendance').select('id').eq('student_id', studentA);
      expect(data).toEqual([]);
    } finally {
      await deleteTestUser(adminB.id);
    }
  });
});

runIf('pedagogical_records.subject_id — vínculo com matéria/área', () => {
  it('registro pedagógico aceita subject_id opcional (nullable), referenciando subjects real', async () => {
    const schoolId = await createTestSchool();
    const teacher = await createTestUser({ role: 'teacher', schoolId, extra: { teacher_status: 'ativo', turmas: ['Infantil I'] } });
    const { data: student } = await adminClient.from('students').insert({ name: 'Aluno PR Vitest', school_id: schoolId, turma: 'Infantil I' }).select('id').single();
    const { data: subject } = await adminClient.from('subjects').insert({ school_id: schoolId, name: 'Vida Prática Vitest' }).select('id').single();

    try {
      const { data, error } = await teacher.client
        .from('pedagogical_records')
        .insert({
          school_id: schoolId, student_id: student.id, author_id: teacher.id,
          record_type: 'DAILY_OBSERVATION', record_date: new Date().toISOString().slice(0, 10),
          content: { atividade: 'Teste' }, subject_id: subject.id,
        })
        .select().single();
      expect(error).toBeNull();
      expect(data.subject_id).toBe(subject.id);
      await adminClient.from('pedagogical_records').delete().eq('id', data.id);
    } finally {
      await adminClient.from('students').delete().eq('id', student.id);
      await adminClient.from('subjects').delete().eq('id', subject.id);
      await deleteTestUser(teacher.id);
      await deleteTestSchool(schoolId);
    }
  });

  it('apagar a matéria NÃO apaga o registro pedagógico -- só desvincula (ON DELETE SET NULL)', async () => {
    const schoolId = await createTestSchool();
    const teacher = await createTestUser({ role: 'teacher', schoolId, extra: { teacher_status: 'ativo', turmas: ['Infantil I'] } });
    const { data: student } = await adminClient.from('students').insert({ name: 'Aluno PR2 Vitest', school_id: schoolId, turma: 'Infantil I' }).select('id').single();
    const { data: subject } = await adminClient.from('subjects').insert({ school_id: schoolId, name: 'Sensorial Vitest' }).select('id').single();
    const { data: record } = await adminClient.from('pedagogical_records').insert({
      school_id: schoolId, student_id: student.id, author_id: teacher.id,
      record_type: 'DAILY_OBSERVATION', record_date: new Date().toISOString().slice(0, 10),
      content: {}, subject_id: subject.id,
    }).select('id').single();

    try {
      await adminClient.from('subjects').delete().eq('id', subject.id);
      const { data: after } = await adminClient.from('pedagogical_records').select('id, subject_id').eq('id', record.id).single();
      expect(after).not.toBeNull(); // registro continua existindo
      expect(after.subject_id).toBeNull(); // só o vínculo sumiu
    } finally {
      await adminClient.from('pedagogical_records').delete().eq('id', record.id);
      await adminClient.from('students').delete().eq('id', student.id);
      await deleteTestUser(teacher.id);
      await deleteTestSchool(schoolId);
    }
  });
});
