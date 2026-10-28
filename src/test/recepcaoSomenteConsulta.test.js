import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Recepção (admin) só consulta cadastros; Gestão cria e edita (28/10/2026).
// Migration 20261104130000_recepcao_somente_consulta. Roda contra o banco local.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Recepção somente consulta', () => {
  let schoolId; let recepcao; let gestao; let familia; let alunoId; let funcId;

  beforeAll(async () => {
    schoolId = await createTestSchool('Vitest Recepcao');
    recepcao = await createTestUser({ role: 'admin', schoolId });
    gestao = await createTestUser({ role: 'gestao', schoolId });
    familia = await createTestUser({ role: 'family', schoolId });
    const { data: aluno, error } = await adminClient.from('students')
      .insert({ name: 'Aluno Teste', school_id: schoolId, family_id: familia.id, turma: 'Turma A' })
      .select('id').single();
    if (error) throw error;
    alunoId = aluno.id;
    const { data: f, error: fe } = await adminClient.from('funcionarios')
      .insert({ school_id: schoolId, name: 'Func Teste', cargo: 'Cozinheira' }).select('id').single();
    if (fe) throw fe;
    funcId = f.id;
  });

  afterAll(async () => {
    await adminClient.from('students').delete().eq('school_id', schoolId);
    await adminClient.from('funcionarios').delete().eq('school_id', schoolId);
    for (const u of [recepcao, gestao, familia]) if (u) await deleteTestUser(u.id);
    if (schoolId) await deleteTestSchool(schoolId);
  });

  it('Recepção continua registrando entrada e saída (colunas do check-in)', async () => {
    const { data, error } = await recepcao.client.from('students')
      .update({ status: 'pending_entry', pending_requester_id: null, today_entry: '08:00', today_entry_at: new Date().toISOString() })
      .eq('id', alunoId).select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('Recepção NÃO altera dados do aluno (nome, turma)', async () => {
    const { error } = await recepcao.client.from('students').update({ name: 'Outro Nome' }).eq('id', alunoId);
    expect(error).not.toBeNull();
    const { data } = await adminClient.from('students').select('name').eq('id', alunoId).single();
    expect(data.name).toBe('Aluno Teste');
  });

  it('Recepção NÃO cria nem apaga aluno', async () => {
    const { error } = await recepcao.client.from('students').insert({ name: 'Novo', school_id: schoolId });
    expect(error).not.toBeNull();
    const { data } = await recepcao.client.from('students').delete().eq('id', alunoId).select('id');
    expect(data ?? []).toHaveLength(0);
    const { data: ainda } = await adminClient.from('students').select('id').eq('id', alunoId);
    expect(ainda).toHaveLength(1);
  });

  it('Recepção NÃO cria conta nem edita a de outra pessoa, mas edita a própria', async () => {
    const { error: insErr } = await recepcao.client.from('users').insert({
      id: crypto.randomUUID(), email: `x${Date.now()}@zela-teste.com`, name: 'X', role: 'family', school_id: schoolId, status: 'pending',
    });
    expect(insErr).not.toBeNull();
    const { data: outro } = await recepcao.client.from('users').update({ name: 'Hackeado' }).eq('id', familia.id).select('id');
    expect(outro ?? []).toHaveLength(0);
    const { data: proprio, error: propErr } = await recepcao.client.from('users').update({ phone: '11999999999' }).eq('id', recepcao.id).select('id');
    expect(propErr).toBeNull();
    expect(proprio).toHaveLength(1);
  });

  it('Recepção lê funcionários mas não escreve', async () => {
    const { data: lista } = await recepcao.client.from('funcionarios').select('id').eq('school_id', schoolId);
    expect(lista).toHaveLength(1);
    const { data: alt } = await recepcao.client.from('funcionarios').update({ cargo: 'Diretora' }).eq('id', funcId).select('id');
    expect(alt ?? []).toHaveLength(0);
    const { error: insErr } = await recepcao.client.from('funcionarios').insert({ school_id: schoolId, name: 'Novo', cargo: 'X' });
    expect(insErr).not.toBeNull();
  });

  it('Gestão segue criando e editando', async () => {
    const { data: ed, error: edErr } = await gestao.client.from('students').update({ name: 'Aluno Editado' }).eq('id', alunoId).select('id');
    expect(edErr).toBeNull();
    expect(ed).toHaveLength(1);
    const { data: f, error: fErr } = await gestao.client.from('funcionarios').update({ cargo: 'Coordenadora' }).eq('id', funcId).select('id');
    expect(fErr).toBeNull();
    expect(f).toHaveLength(1);
    const { data: novo, error: nErr } = await gestao.client.from('students').insert({ name: 'Aluno Novo', school_id: schoolId }).select('id');
    expect(nErr).toBeNull();
    expect(novo).toHaveLength(1);
  });

  it('tour_visto: cada usuário só enxerga e grava o próprio registro', async () => {
    const { error } = await familia.client.from('tour_visto').upsert({ user_id: familia.id, school_id: schoolId, tour_id: 'familia' }, { onConflict: 'user_id,tour_id' });
    expect(error).toBeNull();
    const { data: meu } = await familia.client.from('tour_visto').select('tour_id').eq('user_id', familia.id);
    expect(meu).toHaveLength(1);
    const { data: alheio } = await gestao.client.from('tour_visto').select('tour_id').eq('user_id', familia.id);
    expect(alheio ?? []).toHaveLength(0);
    const { error: falso } = await gestao.client.from('tour_visto').insert({ user_id: familia.id, school_id: schoolId, tour_id: 'gestao' });
    expect(falso).not.toBeNull();
    const { error: outraEscola } = await gestao.client.from('tour_visto').insert({ user_id: gestao.id, school_id: crypto.randomUUID(), tour_id: 'gestao' });
    expect(outraEscola).not.toBeNull();
    const { data: apagou } = await familia.client.from('tour_visto').delete().eq('user_id', familia.id).select('tour_id');
    expect(apagou ?? []).toHaveLength(0);
  });
});
