import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { hasIntegrationCredentials, SUPABASE_URL, ANON_KEY } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Vínculo equipamento → pessoa (PLANO_CONTROLID.md, fase 4): só gestao da escola gerencia; recepcao lê;
// anon/família/outra escola nada; pessoa de outra escola é recusada; resolver só service_role.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario() {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
  const recepcao = await createTestUser({ role: 'recepcao', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const familiaB = await createTestUser({ role: 'family', schoolId: schoolB });
  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: reg } = await gestao.client.rpc('registrar_dispositivo_acesso', { p_school_id: schoolA, p_name: 'iDFace' });
  const deviceRef = (Array.isArray(reg) ? reg[0] : reg).id;
  const limpar = async () => {
    await adminClient.from('device_person_links').delete().in('school_id', [schoolA, schoolB]);
    await adminClient.from('access_devices').delete().in('school_id', [schoolA, schoolB]);
    for (const u of [gestao, gestaoB, recepcao, familia, familiaB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, gestaoB, recepcao, familia, familiaB, anon, deviceRef, limpar };
}

const vincular = (cli, deviceRef, ext, guardian) =>
  cli.rpc('vincular_pessoa_dispositivo', { p_device_ref: deviceRef, p_external_user_id: ext, p_guardian_user_id: guardian });

runIf('Vínculo pessoa-dispositivo · permissões e isolamento', () => {
  it('só gestao da escola vincula; recepcao, família, anon e outra escola não', async () => {
    const c = await montaCenario();
    try {
      for (const u of [c.recepcao, c.familia, c.gestaoB]) {
        const { error } = await vincular(u.client, c.deviceRef, 10, c.familia.id);
        expect(error).toBeTruthy();
      }
      expect((await vincular(c.anon, c.deviceRef, 10, c.familia.id)).error).toBeTruthy();
      const { data, error } = await vincular(c.gestao.client, c.deviceRef, 10, c.familia.id);
      expect(error).toBeNull();
      expect(data).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('recusa pessoa de outra escola e duplicidade (mesmo user_id do equipamento)', async () => {
    const c = await montaCenario();
    try {
      const { error: outra } = await vincular(c.gestao.client, c.deviceRef, 11, c.familiaB.id);
      expect(outra).toBeTruthy();
      expect((await vincular(c.gestao.client, c.deviceRef, 12, c.familia.id)).error).toBeNull();
      expect((await vincular(c.gestao.client, c.deviceRef, 12, c.familia.id)).error).toBeTruthy();
      // service_role também não fura a checagem de escola (trigger)
      const { error: trig } = await adminClient.from('device_person_links').insert({
        school_id: c.schoolA, device_ref: c.deviceRef, external_user_id: 13, guardian_user_id: c.familiaB.id,
      });
      expect(trig).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('leitura: recepcao da escola vê; gestao de outra escola e família não; tabela fechada', async () => {
    const c = await montaCenario();
    try {
      await vincular(c.gestao.client, c.deviceRef, 20, c.familia.id);
      const { data: ok } = await c.recepcao.client.rpc('listar_vinculos_dispositivo', { p_device_ref: c.deviceRef });
      expect(ok).toHaveLength(1);
      for (const u of [c.gestaoB, c.familia]) {
        const { data } = await u.client.rpc('listar_vinculos_dispositivo', { p_device_ref: c.deviceRef });
        expect(data ?? []).toHaveLength(0);
      }
      const { data: direto } = await c.gestao.client.from('device_person_links').select('id');
      expect(direto ?? []).toHaveLength(0);
      const { error: ins } = await c.gestao.client.from('device_person_links').insert({
        school_id: c.schoolA, device_ref: c.deviceRef, external_user_id: 21, guardian_user_id: c.familia.id,
      });
      expect(ins).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('resolver só service_role; desvincular só gestao da escola', async () => {
    const c = await montaCenario();
    try {
      const { data: id } = await vincular(c.gestao.client, c.deviceRef, 30, c.familia.id);
      const args = { p_device_ref: c.deviceRef, p_external_user_id: 30 };
      for (const cli of [c.gestao.client, c.anon]) {
        expect((await cli.rpc('resolver_pessoa_dispositivo', args)).error).toBeTruthy();
      }
      const { data: r } = await adminClient.rpc('resolver_pessoa_dispositivo', args);
      expect(r[0].school_id).toBe(c.schoolA);
      expect(r[0].guardian_user_id).toBe(c.familia.id);

      expect((await c.gestaoB.client.rpc('desvincular_pessoa_dispositivo', { p_link_id: id })).error).toBeTruthy();
      expect((await c.gestao.client.rpc('desvincular_pessoa_dispositivo', { p_link_id: id })).error).toBeNull();
      const { data: depois } = await adminClient.rpc('resolver_pessoa_dispositivo', args);
      expect(depois).toHaveLength(0);
    } finally { await c.limpar(); }
  });
});
