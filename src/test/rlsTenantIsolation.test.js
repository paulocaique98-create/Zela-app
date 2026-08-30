import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  createTestSchool,
  deleteTestSchool,
} from './supabaseTestHelpers.js';

// Testes de isolamento multi-tenant pras 10 policies RLS corrigidas na Fase
// 17 (troca de auth.jwt()->user_metadata pro padrão get_my_role()/
// get_my_school_id()). Regra do teste: cria 2 escolas reais, um admin em
// cada, e confirma que o admin da Escola A nunca consegue ler/escrever dado
// da Escola B — testado direto contra o Supabase real (RLS do banco em si,
// não só a camada de aplicação por cima).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Isolamento multi-tenant — policies corrigidas na Fase 17', () => {
  let schoolA, schoolB, adminA, adminB, studentA;

  beforeAll(async () => {
    schoolA = await createTestSchool('Vitest RLS A');
    schoolB = await createTestSchool('Vitest RLS B');
    adminA = await createTestUser({ role: 'admin', schoolId: schoolA });
    adminB = await createTestUser({ role: 'admin', schoolId: schoolB });

    const { data: student, error } = await adminClient
      .from('students')
      .insert({ name: 'Vitest Aluno A', school_id: schoolA, family_id: adminA.id, turma: 'Infantil I' })
      .select('id')
      .single();
    if (error) throw error;
    studentA = student.id;
  });

  afterAll(async () => {
    try {
      await adminClient.from('students').delete().eq('id', studentA);
    } catch {
      // best-effort
    }
    await deleteTestUser(adminA.id);
    await deleteTestUser(adminB.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  });

  it('admin da Escola B não lê aluno da Escola A (students SELECT)', async () => {
    const { data } = await adminB.client.from('students').select('id').eq('id', studentA);
    expect(data).toEqual([]);
  });

  it('admin da Escola B não atualiza aluno da Escola A (students UPDATE)', async () => {
    const { data } = await adminB.client
      .from('students')
      .update({ turma: 'Hackeado' })
      .eq('id', studentA)
      .select();
    expect(data).toEqual([]);

    const { data: unchanged } = await adminClient.from('students').select('turma').eq('id', studentA).single();
    expect(unchanged.turma).toBe('Infantil I');
  });

  it('admin da Escola B não insere aluno diretamente na Escola A (students INSERT)', async () => {
    const { error } = await adminB.client
      .from('students')
      .insert({ name: 'Invasor', school_id: schoolA, turma: 'X' });
    expect(error).not.toBeNull();
  });

  it('admin da Escola B não lê os dados da Escola A (schools SELECT)', async () => {
    const { data } = await adminB.client.from('schools').select('id').eq('id', schoolA);
    expect(data).toEqual([]);
  });

  it('admin da Escola B não cadastra pessoa autorizada vinculada à Escola A (authorized_persons INSERT)', async () => {
    const { error } = await adminB.client
      .from('authorized_persons')
      .insert({ family_id: adminB.id, school_id: schoolA, name: 'Invasor', relation: 'Teste' });
    expect(error).not.toBeNull();
  });

  it('família sem nenhuma escola associada não vê nenhum aluno (usuário órfão nunca vê tudo por padrão)', async () => {
    const orfao = await createTestUser({ role: 'family', schoolId: null });
    try {
      const { data } = await orfao.client.from('students').select('id');
      expect(data).toEqual([]);
    } finally {
      await deleteTestUser(orfao.id);
    }
  });

  it('regressão específica: usuário forjando o próprio user_metadata pra role=admin não ganha acesso (achado RLS/user_metadata)', async () => {
    const familyOutro = await createTestUser({ role: 'family', schoolId: schoolB });
    try {
      await familyOutro.client.auth.updateUser({ data: { role: 'admin', school_id: schoolA } });
      // Precisa de um login novo pro user_metadata forjado entrar no JWT.
      const relogged = createClient(SUPABASE_URL, ANON_KEY);
      await relogged.auth.signInWithPassword({ email: familyOutro.email, password: 'SenhaTeste123!' });

      const { data } = await relogged.from('students').update({ turma: 'Hackeado2' }).eq('id', studentA).select();
      expect(data).toEqual([]);

      const { data: unchanged } = await adminClient.from('students').select('turma').eq('id', studentA).single();
      expect(unchanged.turma).toBe('Infantil I');
    } finally {
      await deleteTestUser(familyOutro.id);
    }
  });

  it('regressão específica: INSERT direto em users com role=developer é bloqueado pra quem não é developer', async () => {
    const { error } = await adminA.client.from('users').insert({
      id: crypto.randomUUID(),
      email: `vitest.escalada.${Date.now()}@zela-teste.com`,
      name: 'Tentativa de escalada',
      role: 'developer',
      school_id: schoolA,
    });
    expect(error).not.toBeNull();
  });
});
