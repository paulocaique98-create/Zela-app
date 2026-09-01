import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Flexibilidade de Método Pedagógico — Fase 1. Testa o mesmo padrão de
// query/proteção usado por useSchoolConfig() e pela edição restrita a
// developer, contra o banco real.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Configuração pedagógica por escola', () => {
  it('escola nova (sem configuração) tem os defaults esperados: tradicional, custom_config vazio, turmas vazio', async () => {
    const schoolId = await createTestSchool();
    try {
      const { data } = await adminClient.from('schools').select('pedagogical_method, custom_config, turmas').eq('id', schoolId).single();
      expect(data.pedagogical_method).toBe('tradicional');
      expect(data.custom_config).toEqual({});
      expect(data.turmas).toEqual([]);
    } finally {
      await deleteTestSchool(schoolId);
    }
  });

  it('developer consegue configurar uma escola como montessori com turmas próprias', async () => {
    const schoolId = await createTestSchool();
    try {
      const { data, error } = await adminClient
        .from('schools')
        .update({ pedagogical_method: 'montessori', turmas: ['Comunidade Infantil', 'Casa das Crianças'] })
        .eq('id', schoolId)
        .select()
        .single();
      expect(error).toBeNull();
      expect(data.pedagogical_method).toBe('montessori');
      expect(data.turmas).toEqual(['Comunidade Infantil', 'Casa das Crianças']);
    } finally {
      await deleteTestSchool(schoolId);
    }
  });

  it('admin NÃO consegue mudar pedagogical_method/turmas da própria escola (só developer)', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    try {
      const { data, error } = await admin.client.from('schools').update({ pedagogical_method: 'montessori' }).eq('id', schoolId).select();
      expect(data ?? []).toEqual([]);
      expect(error).not.toBeNull();

      const { data: turmasAttempt } = await admin.client.from('schools').update({ turmas: ['Invasão'] }).eq('id', schoolId).select();
      expect(turmasAttempt ?? []).toEqual([]);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  });

  it('CRÍTICO — admin NÃO consegue se auto-escalar via is_active/plan/features_enabled/limits (achado real durante varredura de policies conflitantes)', async () => {
    const schoolId = await createTestSchool();
    await adminClient.from('schools').update({ is_active: false, plan: 'basic', features_enabled: { financeiro: false } }).eq('id', schoolId);
    const admin = await createTestUser({ role: 'admin', schoolId });
    try {
      const r1 = await admin.client.from('schools').update({ is_active: true }).eq('id', schoolId).select();
      expect(r1.data ?? []).toEqual([]);

      const r2 = await admin.client.from('schools').update({ plan: 'pro' }).eq('id', schoolId).select();
      expect(r2.data ?? []).toEqual([]);

      const r3 = await admin.client.from('schools').update({ features_enabled: { financeiro: true } }).eq('id', schoolId).select();
      expect(r3.data ?? []).toEqual([]);

      const r4 = await admin.client.from('schools').update({ limits: { autorizados_por_responsavel: 999 } }).eq('id', schoolId).select();
      expect(r4.data ?? []).toEqual([]);

      // Confirma no banco que nada mudou de verdade.
      const { data: unchanged } = await adminClient.from('schools').select('is_active, plan, features_enabled').eq('id', schoolId).single();
      expect(unchanged.is_active).toBe(false);
      expect(unchanged.plan).toBe('basic');
      expect(unchanged.features_enabled.financeiro).toBe(false);
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  });

  it('admin AINDA consegue editar outros campos da própria escola (nome) — trigger não bloqueia campos não-pedagógicos', async () => {
    const schoolId = await createTestSchool();
    const admin = await createTestUser({ role: 'admin', schoolId });
    try {
      const { data, error } = await admin.client.from('schools').update({ name: 'Nome Editado Pelo Admin' }).eq('id', schoolId).select();
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('Nome Editado Pelo Admin');
    } finally {
      await deleteTestUser(admin.id);
      await deleteTestSchool(schoolId);
    }
  });

  it('família (outra escola) não consegue ler pedagogical_method/turmas de escola alheia', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    await adminClient.from('schools').update({ pedagogical_method: 'montessori', turmas: ['Ambiente 1'] }).eq('id', schoolA);
    const familyB = await createTestUser({ role: 'family', schoolId: schoolB });
    try {
      const { data } = await familyB.client.from('schools').select('pedagogical_method, turmas').eq('id', schoolA);
      expect(data).toEqual([]);
    } finally {
      await deleteTestUser(familyB.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  });
});
