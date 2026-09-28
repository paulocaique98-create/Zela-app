import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Limpeza SUPERVISIONADA de biometria (LGPD, minimização): só aparece e só
// é apagada a biometria de famílias sem nenhum aluno ativo; só a Gestão vê
// e apaga; o servidor confere de novo na hora de apagar.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function addPerson(schoolId, familyId, name) {
  const { data, error } = await adminClient.from('authorized_persons').insert({
    school_id: schoolId, family_id: familyId, name, relation: 'Avó', status: 'approved',
    has_photo: true, face_descriptor: JSON.stringify([0.1, 0.2]), photo_storage_path: `${schoolId}/${name}.jpg`,
    biometric_consent_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

runIf('Limpeza supervisionada de biometria', () => {
  it('lista só famílias sem aluno ativo; só a Gestão vê e apaga; aluno reativado protege a biometria', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const admin = await createTestUser({ role: 'admin', schoolId });
    const familySaiu = await createTestUser({ role: 'family', schoolId });
    const familyAtiva = await createTestUser({ role: 'family', schoolId });
    const { data: students } = await adminClient.from('students').insert([
      { school_id: schoolId, name: 'Vitest Transferido', family_id: familySaiu.id, enrollment_status: 'transferido' },
      { school_id: schoolId, name: 'Vitest Ativo', family_id: familyAtiva.id, enrollment_status: 'ativo' },
    ]).select('id, name');
    const transferido = students.find(s => s.name === 'Vitest Transferido').id;
    const pessoaSaiu = await addPerson(schoolId, familySaiu.id, 'VitestAvoSaiu');
    const pessoaAtiva = await addPerson(schoolId, familyAtiva.id, 'VitestAvoAtiva');
    try {
      const { data: list, error } = await gestao.client.rpc('list_biometria_para_limpar');
      expect(error).toBeNull();
      expect(list.map(r => r.person_id)).toEqual([pessoaSaiu]);
      expect(list[0].alunos).toMatch(/transferido/);

      const { error: adminErr } = await admin.client.rpc('list_biometria_para_limpar');
      expect(adminErr).not.toBeNull();
      const { error: adminPurge } = await admin.client.rpc('purge_biometria', { p_person_ids: [pessoaSaiu] });
      expect(adminPurge).not.toBeNull();

      // Pessoa de família com aluno ativo não é apagada nem se a lista for forjada.
      const { data: purged, error: purgeErr } = await gestao.client.rpc('purge_biometria', { p_person_ids: [pessoaSaiu, pessoaAtiva] });
      expect(purgeErr).toBeNull();
      expect(purged.map(r => r.person_id)).toEqual([pessoaSaiu]);
      expect(purged[0].photo_storage_path).toBe(`${schoolId}/VitestAvoSaiu.jpg`);

      const { data: after } = await adminClient.from('authorized_persons').select('id, name, face_descriptor, photo_storage_path, has_photo').in('id', [pessoaSaiu, pessoaAtiva]);
      const saiu = after.find(p => p.id === pessoaSaiu);
      const ativa = after.find(p => p.id === pessoaAtiva);
      expect(saiu).toMatchObject({ name: 'VitestAvoSaiu', face_descriptor: null, photo_storage_path: null, has_photo: false });
      expect(ativa.face_descriptor).not.toBeNull();

      // Aluno reativado: a biometria nova da família sai da lista.
      const pessoaNova = await addPerson(schoolId, familySaiu.id, 'VitestAvoNova');
      await adminClient.from('students').update({ enrollment_status: 'ativo' }).eq('id', transferido);
      const { data: list2 } = await gestao.client.rpc('list_biometria_para_limpar');
      expect(list2.map(r => r.person_id)).not.toContain(pessoaNova);
      const { data: purged2 } = await gestao.client.rpc('purge_biometria', { p_person_ids: [pessoaNova] });
      expect(purged2).toEqual([]);

      const { data: audit } = await adminClient.from('audit_logs').select('action').eq('school_id', schoolId).eq('action', 'purge_biometria');
      expect(audit.length).toBeGreaterThan(0);
    } finally {
      await adminClient.from('authorized_persons').delete().eq('school_id', schoolId);
      await adminClient.from('students').delete().eq('school_id', schoolId);
      await adminClient.from('audit_logs').delete().eq('school_id', schoolId);
      for (const u of [gestao, admin, familySaiu, familyAtiva]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  }, 45000);
});
