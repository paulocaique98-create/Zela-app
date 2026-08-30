import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  createTestSchool,
  deleteTestSchool,
} from './supabaseTestHelpers.js';

// Testes de regressão dos 3 achados críticos da Fase 17 (Auditoria Final) —
// cada um protege exatamente o incidente real encontrado e corrigido nessa
// fase, contra o projeto Supabase de verdade (não é possível provar RLS/GRANT
// só lendo código — só testando contra o banco real, mesma disciplina usada
// manualmente durante toda a auditoria).
//
// Pulados automaticamente se as credenciais de integração não estiverem
// disponíveis (ex: ambiente de CI sem acesso ao projeto Supabase).
const runIf = hasIntegrationCredentials ? describe : describe.skip;
const anonClient = hasIntegrationCredentials ? createClient(SUPABASE_URL, ANON_KEY) : null;

runIf('Regressão — achado #1: chave real do Asaas vazando por RPC pública', () => {
  it('get_school_gateway_secret NUNCA responde 200 pra uma chamada sem autenticação nenhuma', async () => {
    const { data, error } = await anonClient.rpc('get_school_gateway_secret', {
      p_school_id: '00000000-0000-0000-0000-000000000000',
      p_gateway: 'asaas',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error.code).toBe('42501'); // permission denied — nunca deve chegar a rodar a função
  });

  it('set_school_gateway_secret também nunca aceita chamada anônima (escrita é ainda mais crítica que leitura)', async () => {
    const { error } = await anonClient.rpc('set_school_gateway_secret', {
      p_school_id: '00000000-0000-0000-0000-000000000000',
      p_gateway: 'asaas',
      p_secret: 'tentativa-maliciosa',
    });
    expect(error).not.toBeNull();
    expect(error.code).toBe('42501');
  });

  it('mesmo um usuário autenticado comum (family) não tem acesso direto — só service_role, via Edge Function', async () => {
    const school = await createTestSchool();
    const user = await createTestUser({ role: 'family', schoolId: school });
    try {
      const { data, error } = await user.client.rpc('get_school_gateway_secret', {
        p_school_id: school,
        p_gateway: 'asaas',
      });
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    } finally {
      await deleteTestUser(user.id);
      await deleteTestSchool(school);
    }
  });
});

runIf('Regressão — achado #2: delete_school_and_users sem validação de chamador', () => {
  it('chamada sem autenticação nenhuma falha, e a escola continua existindo', async () => {
    const school = await createTestSchool();
    try {
      const { error } = await anonClient.rpc('delete_school_and_users', { target_school_id: school });
      expect(error).not.toBeNull();

      const { data: stillExists } = await adminClient.from('schools').select('id').eq('id', school).maybeSingle();
      expect(stillExists).not.toBeNull();
    } finally {
      await deleteTestSchool(school);
    }
  });

  it('usuário autenticado SEM ser developer é rejeitado pela checagem interna, escola continua existindo', async () => {
    const school = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId: school });
    try {
      const { error } = await admin.client.rpc('delete_school_and_users', { target_school_id: school });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/developer/i);

      const { data: stillExists } = await adminClient.from('schools').select('id').eq('id', school).maybeSingle();
      expect(stillExists).not.toBeNull();
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestSchool(school);
    }
  });

  it('caminho feliz: um developer de verdade consegue excluir a escola, e os dados relacionados somem em cascata', async () => {
    const school = await createTestSchool();
    const familyInSchool = await createTestUser({ role: 'family', schoolId: school });
    const developer = await createTestUser({ role: 'developer', schoolId: null });
    try {
      const { error } = await developer.client.rpc('delete_school_and_users', { target_school_id: school });
      expect(error).toBeNull();

      const { data: schoolGone } = await adminClient.from('schools').select('id').eq('id', school).maybeSingle();
      expect(schoolGone).toBeNull();

      const { data: userGone } = await adminClient.from('users').select('id').eq('id', familyInSchool.id).maybeSingle();
      expect(userGone).toBeNull();
    } finally {
      // A escola e o usuário family já devem ter sumido pelo próprio teste —
      // isso só limpa caso o teste falhe antes de chegar lá.
      await deleteTestUser(familyInSchool.id).catch(() => {});
      await deleteTestUser(developer.id);
      await deleteTestSchool(school).catch(() => {});
    }
  });
});

runIf('Regressão — achado #3: tabelas internas 100% públicas', () => {
  const tabelasInternas = ['_fase8_backup_photo_url', 'history_records', 'profiles', 'rate_limit_attempts'];

  it.each(tabelasInternas)('%s nunca responde com sucesso pra uma leitura anônima', async (tableName) => {
    const { data, error } = await anonClient.from(tableName).select('*').limit(1);
    expect(error).not.toBeNull();
    expect(error.code).toBe('42501');
    expect(data).toBeNull();
  });

  it.each(tabelasInternas)('%s também nega escrita anônima', async (tableName) => {
    const { error } = await anonClient.from(tableName).insert({});
    expect(error).not.toBeNull();
  });
});
