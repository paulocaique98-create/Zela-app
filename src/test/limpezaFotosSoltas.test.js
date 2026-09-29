import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Fotos de rosto soltas no armazenamento (sem cadastro de autorizado): a
// Gestão vê e apaga; um envio recente (menos de 1 dia) nunca entra.
const runIf = hasIntegrationCredentials ? describe : describe.skip;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

runIf('Limpeza de fotos soltas', () => {
  it('acha só a foto sem cadastro; envio recente fica de fora; só a Gestão', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const admin = await createTestUser({ role: 'admin', schoolId });
    const family = await createTestUser({ role: 'family', schoolId });
    const { data: pessoa } = await adminClient.from('authorized_persons').insert({
      school_id: schoolId, family_id: family.id, name: 'Vitest Com Foto', relation: 'Avó', status: 'approved', has_photo: true,
    }).select('id').single();
    const usada = `${schoolId}/${pessoa.id}.png`;
    const solta = `${schoolId}/00000000-0000-4000-8000-000000000001.png`;
    try {
      for (const p of [usada, solta]) {
        const { error } = await adminClient.storage.from('person-photos').upload(p, new Blob([PNG], { type: 'image/png' }), { upsert: true });
        expect(error).toBeNull();
      }
      await adminClient.from('authorized_persons').update({ photo_storage_path: usada }).eq('id', pessoa.id);

      // Regra interna, sem a espera de 1 dia: só a solta.
      const { data: todas, error } = await adminClient.rpc('fotos_soltas', { p_school_id: schoolId, p_idade_minima: '0 seconds' });
      expect(error).toBeNull();
      expect(todas.map(f => f.path)).toEqual([solta]);

      // Pela Gestão (com a espera de 1 dia): o envio de agora ainda não aparece nem é apagado.
      const { data: lista, error: listErr } = await gestao.client.rpc('list_fotos_soltas');
      expect(listErr).toBeNull();
      expect(lista.map(f => f.path)).not.toContain(solta);
      const { data: confirmadas } = await gestao.client.rpc('confirmar_fotos_soltas', { p_paths: [solta, usada] });
      expect(confirmadas).toEqual([]);

      // Recepção não vê nem apaga.
      const { error: adminList } = await admin.client.rpc('list_fotos_soltas');
      expect(adminList).not.toBeNull();
      const { error: adminConf } = await admin.client.rpc('confirmar_fotos_soltas', { p_paths: [solta] });
      expect(adminConf).not.toBeNull();
    } finally {
      await adminClient.storage.from('person-photos').remove([usada, solta]);
      await adminClient.from('authorized_persons').delete().eq('school_id', schoolId);
      for (const u of [gestao, admin, family]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});
