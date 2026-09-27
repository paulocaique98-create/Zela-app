import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// O Portal da Gestão reaproveita telas do Admin. Regressão do bug real de
// 27/09/2026: Cadastros · Funcionários abria vazio pra Gestão (a tabela só
// tinha policy pra admin) e não dava pra cadastrar funcionário -- nem,
// portanto, criar o acesso dos admins.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Gestão · acesso às telas reaproveitadas do Admin', () => {
  it('Gestão cadastra e lista funcionários, eventos do calendário e comunicados da própria escola', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    try {
      const { error: fErr } = await gestao.client.from('funcionarios').insert({ school_id: schoolId, name: 'Recepcionista Vitest', cargo: 'Recepcionista' });
      expect(fErr).toBeNull();
      const { data: funcionarios } = await gestao.client.from('funcionarios').select('name').eq('school_id', schoolId);
      expect(funcionarios.map(f => f.name)).toContain('Recepcionista Vitest');

      const { error: eErr } = await gestao.client.from('eventos_calendario').insert({ school_id: schoolId, title: 'Reunião Vitest', event_date: '2026-10-10' });
      expect(eErr).toBeNull();

      const { error: cErr } = await gestao.client.from('comunicados').insert({ school_id: schoolId, title: 'Aviso Vitest', body: 'Texto', created_by: gestao.id });
      expect(cErr).toBeNull();
    } finally {
      await adminClient.from('funcionarios').delete().eq('school_id', schoolId);
      await adminClient.from('eventos_calendario').delete().eq('school_id', schoolId);
      await adminClient.from('comunicados').delete().eq('school_id', schoolId);
      await deleteTestUser(gestao.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);

  it('Gestão não enxerga funcionários de outra escola; família não cadastra funcionário', async () => {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
    const family = await createTestUser({ role: 'family', schoolId: schoolA });
    await adminClient.from('funcionarios').insert({ school_id: schoolA, name: 'Funcionária Escola A', cargo: 'Professora' });
    try {
      const { data: other } = await gestaoB.client.from('funcionarios').select('id').eq('school_id', schoolA);
      expect(other).toEqual([]);
      const { error: famErr } = await family.client.from('funcionarios').insert({ school_id: schoolA, name: 'Invasora', cargo: 'Recepcionista' });
      expect(famErr).not.toBeNull();
    } finally {
      await adminClient.from('funcionarios').delete().in('school_id', [schoolA, schoolB]);
      await deleteTestUser(gestaoB.id);
      await deleteTestUser(family.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    }
  }, 30000);
});
