import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { hasIntegrationCredentials, SUPABASE_URL, ANON_KEY } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Fila de comandos (PLANO_CONTROLID.md, fase 5): só gestao da escola enfileira; recepcao lê;
// anon/família/outra escola nada; entrega e conclusão só service_role; um comando em voo por vez.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario() {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
  const recepcao = await createTestUser({ role: 'recepcao', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: reg } = await gestao.client.rpc('registrar_dispositivo_acesso', { p_school_id: schoolA, p_name: 'iDFace' });
  const deviceRef = (Array.isArray(reg) ? reg[0] : reg).id;
  const { data: pessoa } = await adminClient.from('authorized_persons')
    .insert({ name: 'Tia Teste', relation: 'tia', school_id: schoolA, status: 'approved' }).select('id').single();
  const { data: pessoaB } = await adminClient.from('authorized_persons')
    .insert({ name: 'Outra', relation: 'tio', school_id: schoolB, status: 'approved' }).select('id').single();
  const { error: vErr } = await gestao.client.rpc('vincular_pessoa_dispositivo', { p_device_ref: deviceRef, p_external_user_id: 10, p_authorized_person_id: pessoa.id });
  if (vErr) throw vErr;
  const limpar = async () => {
    await adminClient.from('device_commands').delete().in('school_id', [schoolA, schoolB]);
    await adminClient.from('device_person_links').delete().in('school_id', [schoolA, schoolB]);
    await adminClient.from('authorized_persons').delete().in('school_id', [schoolA, schoolB]);
    await adminClient.from('access_devices').delete().in('school_id', [schoolA, schoolB]);
    for (const u of [gestao, gestaoB, recepcao, familia]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, gestao, gestaoB, recepcao, familia, anon, deviceRef, pessoa, pessoaB, limpar };
}

const enfileirar = (cli, ref, cmd, ext) =>
  cli.rpc('enfileirar_comando_dispositivo', { p_device_ref: ref, p_command: cmd, p_external_user_id: ext });

runIf('device_commands · permissões e isolamento', () => {
  it('só gestao da escola enfileira; recepcao, família, anon e outra escola não', async () => {
    const c = await montaCenario();
    try {
      for (const cli of [c.recepcao.client, c.familia.client, c.gestaoB.client, c.anon]) {
        const { error } = await enfileirar(cli, c.deviceRef, 'create_user', 10);
        expect(error).toBeTruthy();
      }
      const { error } = await enfileirar(c.gestao.client, c.deviceRef, 'create_user', 10);
      expect(error).toBeNull();
      const { data: lista } = await c.recepcao.client.rpc('listar_comandos_dispositivo', { p_device_ref: c.deviceRef });
      expect(lista).toHaveLength(1);
      const { data: listaB } = await c.gestaoB.client.rpc('listar_comandos_dispositivo', { p_device_ref: c.deviceRef });
      expect(listaB).toHaveLength(0);
      const { data: listaF } = await c.familia.client.rpc('listar_comandos_dispositivo', { p_device_ref: c.deviceRef });
      expect(listaF).toHaveLength(0);
    } finally { await c.limpar(); }
  });

  it('tabela fechada e funções do equipamento só service_role', async () => {
    const c = await montaCenario();
    try {
      for (const cli of [c.gestao.client, c.recepcao.client, c.anon]) {
        const { data } = await cli.from('device_commands').select('id').limit(5);
        expect(data ?? []).toHaveLength(0);
        const { error: e1 } = await cli.rpc('proximo_comando_dispositivo', { p_device_ref: c.deviceRef });
        expect(e1).toBeTruthy();
        const { error: e2 } = await cli.rpc('concluir_comando_dispositivo', { p_device_ref: c.deviceRef, p_ok: true });
        expect(e2).toBeTruthy();
      }
    } finally { await c.limpar(); }
  });

  it('create sem vínculo e set_photo sem consentimento são recusados; delete não exige vínculo', async () => {
    const c = await montaCenario();
    try {
      expect((await enfileirar(c.gestao.client, c.deviceRef, 'create_user', 99)).error).toBeTruthy();
      expect((await enfileirar(c.gestao.client, c.deviceRef, 'set_photo', 10)).error).toBeTruthy();
      expect((await enfileirar(c.gestao.client, c.deviceRef, 'delete_user', 99)).error).toBeNull();
      const { error } = await c.gestao.client.rpc('vincular_pessoa_dispositivo', { p_device_ref: c.deviceRef, p_external_user_id: 11, p_authorized_person_id: c.pessoaB.id });
      expect(error).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('um em voo por vez; resultado conclui; duplicado aberto é recusado; foto só com consentimento', async () => {
    const c = await montaCenario();
    try {
      expect((await enfileirar(c.gestao.client, c.deviceRef, 'create_user', 10)).error).toBeNull();
      expect((await enfileirar(c.gestao.client, c.deviceRef, 'create_user', 10)).error).toBeTruthy();
      await adminClient.from('authorized_persons').update({ biometric_consent_at: new Date().toISOString(), photo_storage_path: `${c.schoolA}/${c.pessoa.id}.jpg` }).eq('id', c.pessoa.id);
      expect((await enfileirar(c.gestao.client, c.deviceRef, 'set_photo', 10)).error).toBeNull();

      const { data: p1 } = await adminClient.rpc('proximo_comando_dispositivo', { p_device_ref: c.deviceRef });
      expect(p1).toHaveLength(1);
      expect(p1[0].command).toBe('create_user');
      const { data: p2 } = await adminClient.rpc('proximo_comando_dispositivo', { p_device_ref: c.deviceRef });
      expect(p2).toHaveLength(0);

      await adminClient.rpc('concluir_comando_dispositivo', { p_device_ref: c.deviceRef, p_ok: true });
      // consentimento revogado antes do envio: set_photo falha e não é entregue
      await adminClient.from('authorized_persons').update({ biometric_consent_at: null }).eq('id', c.pessoa.id);
      const { data: p3 } = await adminClient.rpc('proximo_comando_dispositivo', { p_device_ref: c.deviceRef });
      expect(p3).toHaveLength(0);
      const { data: cmds } = await adminClient.from('device_commands').select('command,status').eq('device_ref', c.deviceRef);
      expect(cmds.find((x) => x.command === 'create_user').status).toBe('done');
      expect(cmds.find((x) => x.command === 'set_photo').status).toBe('failed');
    } finally { await c.limpar(); }
  });
});
