import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Fase 10 (Testes) do módulo Secretaria. Cobre os pontos de permissão
// decididos ao longo das Fases 3-9: o que ficou paralelo (admin + gestao)
// de propósito porque telas antigas do Admin (AdminUserRegistration.jsx,
// AdminStudentList.jsx) dependem disso, e o que foi cortado pra só gestao
// (decisão de matrícula, transferência externa, documentos do aluno).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function setupStudent(schoolId, extra = {}) {
  const { data, error } = await adminClient.from('students').insert({ school_id: schoolId, name: 'Vitest Secretaria Aluno', turma: 'Nido', ...extra }).select('id').single();
  if (error) throw error;
  return data.id;
}

runIf('Secretaria — Alunos (students.enrollment_status / UPDATE em paralelo)', () => {
  it('admin E gestao conseguem editar o cadastro do aluno (paralelo por decisão da Fase 9)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const studentId = await setupStudent(schoolId);
    try {
      const { error: adminErr } = await admin.client.from('students').update({ enrollment_status: 'inativo' }).eq('id', studentId);
      expect(adminErr).toBeNull();

      const { error: gestaoErr } = await gestao.client.from('students').update({ enrollment_status: 'ativo' }).eq('id', studentId);
      expect(gestaoErr).toBeNull();

      const { data: student } = await adminClient.from('students').select('enrollment_status').eq('id', studentId).single();
      expect(student.enrollment_status).toBe('ativo');
    } finally {
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 15000);

  it('gestao de outra escola não consegue editar aluno alheio', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
    const studentId = await setupStudent(schoolA);
    try {
      const { error } = await gestaoB.client.from('students').update({ enrollment_status: 'inativo' }).eq('id', studentId);
      const { data: unchanged } = await adminClient.from('students').select('enrollment_status').eq('id', studentId).single();
      expect(unchanged.enrollment_status).toBe('ativo');
      // RLS silenciosa: pode não retornar erro explícito, mas nada muda.
      void error;
    } finally {
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(gestaoB.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  }, 15000);
});

runIf('Secretaria — Matrículas (matricula_solicitacoes cortado pra gestao na Fase 9)', () => {
  async function setupSolicitacao(schoolId, familyId) {
    const { data, error } = await adminClient.from('matricula_solicitacoes').insert({
      school_id: schoolId,
      family_id: familyId,
      tipo: 'rematricula',
      status: 'pending',
      responsavel_financeiro: { nome: 'Vitest Responsável', email: 'vitest@zela-teste.com' },
      criancas: [{ nome: 'Vitest Criança' }],
    }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  it('admin NÃO consegue mais decidir (aprovar/rejeitar/pedir ajuste) — só gestao', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    const solicitacaoId = await setupSolicitacao(schoolId, family.id);
    try {
      const { error: adminErr } = await admin.client.from('matricula_solicitacoes').update({ status: 'rejected', rejection_reason: 'teste' }).eq('id', solicitacaoId);
      const { data: stillPending } = await adminClient.from('matricula_solicitacoes').select('status').eq('id', solicitacaoId).single();
      expect(stillPending.status).toBe('pending');
      void adminErr;

      const { error: gestaoErr } = await gestao.client.from('matricula_solicitacoes').update({ status: 'changes_requested', rejection_reason: 'Falta anexar RG' }).eq('id', solicitacaoId);
      expect(gestaoErr).toBeNull();

      const { data: afterGestao } = await adminClient.from('matricula_solicitacoes').select('status, rejection_reason').eq('id', solicitacaoId).single();
      expect(afterGestao.status).toBe('changes_requested');
      expect(afterGestao.rejection_reason).toBe('Falta anexar RG');
    } finally {
      await adminClient.from('matricula_solicitacoes').delete().eq('id', solicitacaoId);
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 15000);

  it('approve_atualizacao_cadastral: admin recebe "Permissão negada", gestao aprova (checagem de role trocada na Fase 9)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    const { data: solicitacao, error: setupErr } = await adminClient.from('matricula_solicitacoes').insert({
      school_id: schoolId,
      family_id: family.id,
      tipo: 'atualizacao_cadastral',
      status: 'pending',
      responsavel_financeiro: { nome: 'Vitest Responsável' },
      criancas: [],
      autorizados: [],
    }).select('id').single();
    if (setupErr) throw setupErr;
    try {
      const { error: adminErr } = await admin.client.rpc('approve_atualizacao_cadastral', { p_solicitacao_id: solicitacao.id });
      expect(adminErr?.message).toMatch(/Permissão negada/);

      const { error: gestaoErr } = await gestao.client.rpc('approve_atualizacao_cadastral', { p_solicitacao_id: solicitacao.id });
      expect(gestaoErr).toBeNull();

      const { data: afterApprove } = await adminClient.from('matricula_solicitacoes').select('status').eq('id', solicitacao.id).single();
      expect(afterApprove.status).toBe('approved');
    } finally {
      await adminClient.from('matricula_solicitacoes').delete().eq('id', solicitacao.id);
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 15000);

  it('admin continua lendo (nunca perde leitura) as solicitações da escola', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    const solicitacaoId = await setupSolicitacao(schoolId, family.id);
    try {
      const { data, error } = await admin.client.from('matricula_solicitacoes').select('id').eq('id', solicitacaoId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    } finally {
      await adminClient.from('matricula_solicitacoes').delete().eq('id', solicitacaoId);
      await deleteTestUser(admin.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 15000);

  it('família consegue reenviar (voltar pra pending) uma solicitação em changes_requested, mas não consegue se auto-aprovar', async () => {
    const schoolId = await createTestSchool();
    const family = await createTestUser({ role: 'family', schoolId });
    const solicitacaoId = await setupSolicitacao(schoolId, family.id);
    await adminClient.from('matricula_solicitacoes').update({ status: 'changes_requested', rejection_reason: 'Falta CPF' }).eq('id', solicitacaoId);
    try {
      const { error: approveAttempt } = await family.client.from('matricula_solicitacoes').update({ status: 'approved' }).eq('id', solicitacaoId);
      const { data: afterApproveAttempt } = await adminClient.from('matricula_solicitacoes').select('status').eq('id', solicitacaoId).single();
      expect(afterApproveAttempt.status).toBe('changes_requested');
      void approveAttempt;

      const { error: resendErr } = await family.client.from('matricula_solicitacoes').update({ status: 'pending', rejection_reason: null }).eq('id', solicitacaoId);
      expect(resendErr).toBeNull();

      const { data: afterResend } = await adminClient.from('matricula_solicitacoes').select('status, rejection_reason').eq('id', solicitacaoId).single();
      expect(afterResend.status).toBe('pending');
      expect(afterResend.rejection_reason).toBeNull();
    } finally {
      await adminClient.from('matricula_solicitacoes').delete().eq('id', solicitacaoId);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolId);
    }
  }, 15000);
});

runIf('Secretaria — Transferência externa (transfer_student_to_external_school)', () => {
  it('gestao transfere o aluno pra outra escola: marca transferido e registra o histórico', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const studentId = await setupStudent(schoolId);
    try {
      const { error } = await gestao.client.rpc('transfer_student_to_external_school', {
        p_student_id: studentId,
        p_destination_school_name: 'Colégio Vitest Concorrente',
        p_reason: 'Mudança de cidade',
      });
      expect(error).toBeNull();

      const { data: student } = await adminClient.from('students').select('enrollment_status, turma').eq('id', studentId).single();
      expect(student.enrollment_status).toBe('transferido');
      expect(student.turma).toBe('Nido'); // turma não muda numa saída externa

      const { data: log } = await adminClient.from('student_transfers').select('transfer_type, destination_school_name, to_class_name').eq('student_id', studentId).single();
      expect(log.transfer_type).toBe('saida_externa');
      expect(log.destination_school_name).toBe('Colégio Vitest Concorrente');
      expect(log.to_class_name).toBeNull();
    } finally {
      await adminClient.from('student_transfers').delete().eq('student_id', studentId);
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 15000);

  it('admin NÃO consegue transferir pra outra escola — só gestao (cortado na Fase 9)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const studentId = await setupStudent(schoolId);
    try {
      const { error } = await admin.client.rpc('transfer_student_to_external_school', {
        p_student_id: studentId,
        p_destination_school_name: 'Colégio Vitest Concorrente',
      });
      expect(error).not.toBeNull();

      const { data: unchanged } = await adminClient.from('students').select('enrollment_status').eq('id', studentId).single();
      expect(unchanged.enrollment_status).toBe('ativo');
    } finally {
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  }, 15000);
});

runIf('Secretaria — Documentos do aluno (student_documents, exclusivo gestao)', () => {
  it('gestao insere e lê documento; admin lê mas não insere (leitura nunca é cortada, escrita é exclusiva)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const studentId = await setupStudent(schoolId);
    let docId;
    try {
      const { data: inserted, error: insertErr } = await gestao.client.from('student_documents').insert({
        school_id: schoolId,
        student_id: studentId,
        category: 'rg',
        file_name: 'rg-vitest.pdf',
        storage_path: `${schoolId}/${studentId}/rg-vitest.pdf`,
      }).select('id').single();
      expect(insertErr).toBeNull();
      docId = inserted.id;

      const { error: adminInsertErr } = await admin.client.from('student_documents').insert({
        school_id: schoolId,
        student_id: studentId,
        category: 'outro',
        file_name: 'nao-deveria-entrar.pdf',
        storage_path: `${schoolId}/${studentId}/nao-deveria-entrar.pdf`,
      });
      expect(adminInsertErr).not.toBeNull();

      const { data: adminRead, error: adminReadErr } = await admin.client.from('student_documents').select('id').eq('student_id', studentId);
      expect(adminReadErr).toBeNull();
      expect(adminRead).toHaveLength(1);
    } finally {
      if (docId) await adminClient.from('student_documents').delete().eq('id', docId);
      await adminClient.from('students').delete().eq('id', studentId);
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 15000);
});
