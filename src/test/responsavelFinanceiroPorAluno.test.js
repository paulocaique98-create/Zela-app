import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Responsável financeiro escolhido por aluno (irmãos com pagadores
// diferentes, cada um com a cobrança e a nota no próprio nome).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

// Mesma leitura de create-financial-contract/create-avulsa-charge: o
// cliente do Asaas (e a futura nota) sai no nome desta pessoa.
async function pagadorDaCobranca(studentId) {
  const { data, error } = await adminClient
    .from('student_guardians').select('guardian_id').eq('student_id', studentId).eq('is_financial', true).maybeSingle();
  if (error) throw error;
  return data?.guardian_id ?? null;
}

runIf('Responsável financeiro por aluno', () => {
  it('cada irmão com seu pagador; exige CPF, vínculo e nenhum contrato em andamento; nunca dois financeiros', async () => {
    const schoolId = await createTestSchool();
    const recepcao = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const pai = await createTestUser({ role: 'family', schoolId, extra: { doc_number: '11122233344' } });
    const mae = await createTestUser({ role: 'family', schoolId });
    try {
      const { data: alunos } = await adminClient.from('students').insert([
        { school_id: schoolId, name: 'Vitest Irmao Davi', family_id: pai.id },
        { school_id: schoolId, name: 'Vitest Irma Joana', family_id: pai.id },
        { school_id: schoolId, name: 'Vitest Outro Aluno', family_id: pai.id },
      ]).select('id, name');
      const davi = alunos.find(a => a.name.includes('Davi')).id;
      const joana = alunos.find(a => a.name.includes('Joana')).id;
      const outro = alunos.find(a => a.name.includes('Outro')).id;
      await adminClient.from('student_guardians').insert([
        { student_id: davi, guardian_id: pai.id, school_id: schoolId, is_primary: true, is_financial: true },
        { student_id: davi, guardian_id: mae.id, school_id: schoolId, is_primary: false, is_financial: false },
        { student_id: joana, guardian_id: pai.id, school_id: schoolId, is_primary: true, is_financial: true },
        { student_id: joana, guardian_id: mae.id, school_id: schoolId, is_primary: false, is_financial: false },
        { student_id: outro, guardian_id: pai.id, school_id: schoolId, is_primary: true, is_financial: true },
      ]);

      // Sem CPF não vira financeira.
      const { error: semCpf } = await recepcao.client.rpc('set_student_financial_guardian', { p_student_id: joana, p_guardian_id: mae.id });
      expect(semCpf?.message).toMatch(/CPF/);

      // Com CPF: Joana passa a ser cobrada da mãe; Davi continua com o pai.
      await adminClient.from('users').update({ doc_number: '55566677788' }).eq('id', mae.id);
      const { error: ok } = await recepcao.client.rpc('set_student_financial_guardian', { p_student_id: joana, p_guardian_id: mae.id });
      expect(ok).toBeNull();
      expect(await pagadorDaCobranca(joana)).toBe(mae.id);
      expect(await pagadorDaCobranca(davi)).toBe(pai.id);

      // Só quem é responsável daquele aluno.
      const { error: semVinculo } = await gestao.client.rpc('set_student_financial_guardian', { p_student_id: outro, p_guardian_id: mae.id });
      expect(semVinculo?.message).toMatch(/não é responsável/);

      // A família não escolhe.
      const { error: familia } = await pai.client.rpc('set_student_financial_guardian', { p_student_id: joana, p_guardian_id: pai.id });
      expect(familia).not.toBeNull();

      // Nunca dois financeiros no mesmo aluno, nem por gravação direta.
      const { error: dois } = await adminClient.from('student_guardians').update({ is_financial: true }).eq('student_id', joana).eq('guardian_id', pai.id);
      expect(dois?.code).toBe('23505');

      // Com contrato em andamento, a troca é bloqueada (a assinatura já está no nome da mãe).
      await adminClient.from('financial_contracts').insert({
        school_id: schoolId, student_id: joana, financial_guardian_id: mae.id, billing_cycle: 'MONTHLY',
        base_monthly_amount_cents: 100000, amount_cents: 100000, first_due_date: '2026-10-10', status: 'active',
      });
      const { error: comContrato } = await gestao.client.rpc('set_student_financial_guardian', { p_student_id: joana, p_guardian_id: pai.id });
      expect(comContrato?.message).toMatch(/contrato/);
      expect(await pagadorDaCobranca(joana)).toBe(mae.id);

      const { data: logs } = await adminClient.from('audit_logs').select('entity_id').eq('school_id', schoolId).eq('action', 'set_student_financial_guardian');
      expect(logs.map(l => l.entity_id)).toEqual([joana]);
    } finally {
      await adminClient.from('financial_contracts').delete().eq('school_id', schoolId);
      await adminClient.from('student_guardians').delete().eq('school_id', schoolId);
      await adminClient.from('students').delete().eq('school_id', schoolId);
      for (const u of [recepcao, gestao, pai, mae]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});
