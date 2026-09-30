import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';
import { quemFezHoje } from '../lib/quemRegistrou.js';

// Família vê quem fez a entrada e a saída (30/09/2026): o titular e o 2º
// responsável leem o nome de quem foi reconhecido no autoatendimento nos
// registros do próprio filho (Acompanhamento e Histórico); outra família não.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Família vê quem fez a entrada e a saída', () => {
  const ctx = { contas: [] };

  beforeAll(async () => {
    ctx.schoolId = await createTestSchool('Vitest Quem Registrou');
    ctx.recepcao = await createTestUser({ role: 'admin', schoolId: ctx.schoolId });
    ctx.titular = await createTestUser({ role: 'family', schoolId: ctx.schoolId });
    ctx.segundo = await createTestUser({ role: 'family', schoolId: ctx.schoolId });
    ctx.outra = await createTestUser({ role: 'family', schoolId: ctx.schoolId });
    ctx.contas.push(ctx.recepcao.id, ctx.titular.id, ctx.segundo.id, ctx.outra.id);
    const { data: aluno } = await adminClient.from('students')
      .insert({ name: 'Vitest Maitê', school_id: ctx.schoolId, family_id: ctx.titular.id }).select('id').single();
    ctx.alunoId = aluno.id;
    const { error: gErr } = await adminClient.from('student_guardians').insert({ student_id: aluno.id, guardian_id: ctx.segundo.id, school_id: ctx.schoolId, relationship: 'Pai' });
    if (gErr) throw gErr;
    const hoje = new Date().toISOString();
    const { error: lErr } = await adminClient.from('attendance_logs').insert([
      { student_id: aluno.id, family_id: ctx.titular.id, school_id: ctx.schoolId, event_type: 'entry', event_time: hoje, recorded_by: ctx.recepcao.id, performed_by_name: 'Avó Rosa', corrected: false },
      { student_id: aluno.id, family_id: ctx.titular.id, school_id: ctx.schoolId, event_type: 'exit', event_time: new Date(Date.now() + 60000).toISOString(), recorded_by: ctx.recepcao.id, performed_by_name: null, corrected: true },
    ]);
    if (lErr) throw lErr;
  }, 60000);

  afterAll(async () => {
    await adminClient.from('attendance_logs').delete().eq('student_id', ctx.alunoId);
    await adminClient.from('student_guardians').delete().eq('student_id', ctx.alunoId);
    await adminClient.from('students').delete().eq('id', ctx.alunoId);
    for (const id of ctx.contas) await deleteTestUser(id);
    await deleteTestSchool(ctx.schoolId);
  }, 60000);

  const ler = (conta) => conta.client.from('attendance_logs')
    .select('student_id, event_type, event_time, performed_by_name, corrected').eq('student_id', ctx.alunoId);

  it('o titular e o 2º responsável veem quem fez a entrada e a saída', async () => {
    for (const conta of [ctx.titular, ctx.segundo]) {
      const { data, error } = await ler(conta);
      expect(error).toBeNull();
      expect(data, conta === ctx.titular ? 'titular' : '2º responsável').toHaveLength(2);
      expect(quemFezHoje(data)[ctx.alunoId]).toEqual({ entrada: 'Registrado por Avó Rosa', saida: 'Lançado pela escola' });
    }
  }, 30000);

  it('outra família da mesma escola não vê os registros', async () => {
    const { data } = await ler(ctx.outra);
    expect(data ?? []).toEqual([]);
  }, 30000);
});
