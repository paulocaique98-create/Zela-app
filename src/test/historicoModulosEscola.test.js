import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Histórico dos módulos contratados (Portal do Dev · Módulos): a trigger grava
// uma linha por chave de features_enabled que mudou, com quem e quando; só o
// developer lê; nunca impede a escola de ser salva.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function historico(schoolId) {
  const { data, error } = await adminClient
    .from('school_feature_changes')
    .select('feature_key, enabled, changed_by, changed_by_name')
    .eq('school_id', schoolId)
    .order('feature_key');
  if (error) throw error;
  return data;
}

runIf('Histórico dos módulos da escola', () => {
  it('grava só as chaves que mudaram, com o nome de quem mudou; só o developer lê', async () => {
    const schoolId = await createTestSchool();
    const dev = await createTestUser({ role: 'developer' });
    const admin = await createTestUser({ role: 'admin', schoolId });
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    try {
      await adminClient.from('schools').update({ features_enabled: { checkin: true, financeiro: false, diario: true } }).eq('id', schoolId);
      await adminClient.from('school_feature_changes').delete().eq('school_id', schoolId);

      const { error } = await dev.client
        .from('schools')
        .update({ features_enabled: { checkin: true, financeiro: true, diario: false, mural: true } })
        .eq('id', schoolId);
      expect(error).toBeNull();

      const rows = await historico(schoolId);
      expect(rows.map(r => [r.feature_key, r.enabled])).toEqual([['diario', false], ['financeiro', true], ['mural', true]]);
      const { data: devUser } = await adminClient.from('users').select('name').eq('id', dev.id).single();
      expect(rows.every(r => r.changed_by === dev.id && r.changed_by_name === devUser.name)).toBe(true);

      // Salvar outra coisa da escola não gera histórico de módulos.
      await adminClient.from('schools').update({ name: 'Vitest Escola Renomeada' }).eq('id', schoolId);
      expect(await historico(schoolId)).toHaveLength(3);

      const { data: devRead } = await dev.client.from('school_feature_changes').select('feature_key').eq('school_id', schoolId);
      expect(devRead).toHaveLength(3);
      for (const outro of [admin, gestao]) {
        const { data } = await outro.client.from('school_feature_changes').select('feature_key').eq('school_id', schoolId);
        expect(data).toEqual([]);
        const { error: insertError } = await outro.client.from('school_feature_changes').insert({ school_id: schoolId, feature_key: 'x', enabled: true });
        expect(insertError).not.toBeNull();
      }
    } finally {
      await deleteTestUser(dev.id);
      await deleteTestUser(admin.id);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  });

  it('alteração sem usuário logado (service role) também salva e fica registrada sem autor', async () => {
    const schoolId = await createTestSchool();
    try {
      await adminClient.from('school_feature_changes').delete().eq('school_id', schoolId);
      const { error } = await adminClient.from('schools').update({ features_enabled: { qr_checkin: true } }).eq('id', schoolId);
      expect(error).toBeNull();
      const rows = await historico(schoolId);
      expect(rows.find(r => r.feature_key === 'qr_checkin')).toMatchObject({ enabled: true, changed_by: null, changed_by_name: null });
    } finally {
      await deleteTestSchool(schoolId);
    }
  });
});
