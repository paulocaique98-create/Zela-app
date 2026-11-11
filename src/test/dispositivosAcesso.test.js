import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { hasIntegrationCredentials, SUPABASE_URL, ANON_KEY } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Dispositivos de acesso (PLANO_CONTROLID.md, fase 2): só gestao/developer gerenciam; admin/recepcao só leem;
// anon e outra escola não leem nem gravam; tabelas só pelas funções; função do equipamento só service_role;
// token guardado só como hash; evento repetido ignorado; escola do evento sai do dispositivo.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario() {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
  const recepcao = await createTestUser({ role: 'recepcao', schoolId: schoolA });
  const admin = await createTestUser({ role: 'admin', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const limpar = async () => {
    await adminClient.from('device_events').delete().in('school_id', [schoolA, schoolB]);
    await adminClient.from('access_devices').delete().in('school_id', [schoolA, schoolB]);
    for (const u of [gestao, gestaoB, recepcao, admin, familia]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, gestaoB, recepcao, admin, familia, anon, limpar };
}

const registrar = (cliente, schoolId, name = 'iDFace Portaria') =>
  cliente.rpc('registrar_dispositivo_acesso', { p_school_id: schoolId, p_name: name });
const um = (data) => (Array.isArray(data) ? data[0] : data);

runIf('Dispositivos de acesso · permissões e isolamento', () => {
  it('só gestao da própria escola registra; recepcao, admin, família, anon e gestao de outra escola não', async () => {
    const c = await montaCenario();
    try {
      for (const u of [c.recepcao, c.admin, c.familia, c.gestaoB]) {
        const { error } = await registrar(u.client, c.schoolA, `x-${u.id.slice(0, 6)}`);
        expect(error).toBeTruthy();
      }
      const { error: anonErr } = await registrar(c.anon, c.schoolA);
      expect(anonErr).toBeTruthy();

      const { data, error } = await registrar(c.gestao.client, c.schoolA);
      expect(error).toBeNull();
      const { id, token } = um(data);
      expect(token).toHaveLength(64);

      // token nunca fica em texto: só o hash (64 hex) diferente do token
      const { data: linha } = await adminClient.from('access_devices').select('token_hash, school_id').eq('id', id).single();
      expect(linha.school_id).toBe(c.schoolA);
      expect(linha.token_hash).toHaveLength(64);
      expect(linha.token_hash).not.toBe(token);
    } finally { await c.limpar(); }
  });

  it('tabelas não são legíveis nem graváveis direto por usuário logado ou anon', async () => {
    const c = await montaCenario();
    try {
      const { data: reg } = await registrar(c.gestao.client, c.schoolA);
      const { id } = um(reg);
      for (const cli of [c.gestao.client, c.recepcao.client, c.anon]) {
        const { data, error } = await cli.from('access_devices').select('id, token_hash');
        expect(error || (data || []).length === 0).toBeTruthy();
        const { data: ev, error: evErr } = await cli.from('device_events').select('id');
        expect(evErr || (ev || []).length === 0).toBeTruthy();
      }
      const { error: insErr } = await c.gestao.client.from('access_devices')
        .insert({ school_id: c.schoolA, name: 'direto', token_hash: 'a'.repeat(64) });
      expect(insErr).toBeTruthy();
      const { data: upd } = await c.gestao.client.from('access_devices').update({ status: 'active' }).eq('id', id).select('id');
      expect(upd || []).toHaveLength(0);
    } finally { await c.limpar(); }
  });

  it('listagem: gestao/admin/recepcao veem só a própria escola, sem token_hash; família, anon e outra escola não veem', async () => {
    const c = await montaCenario();
    try {
      await registrar(c.gestao.client, c.schoolA);
      for (const u of [c.gestao, c.admin, c.recepcao]) {
        const { data, error } = await u.client.rpc('listar_dispositivos_acesso');
        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(data[0].school_id).toBe(c.schoolA);
        expect(data[0]).not.toHaveProperty('token_hash');
      }
      const { data: outra } = await c.gestaoB.client.rpc('listar_dispositivos_acesso');
      expect(outra || []).toHaveLength(0);
      const { data: fam } = await c.familia.client.rpc('listar_dispositivos_acesso');
      expect(fam || []).toHaveLength(0);
      const { error: anonErr } = await c.anon.rpc('listar_dispositivos_acesso');
      expect(anonErr).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('girar token e mudar status: só gestao da escola; token antigo deixa de valer', async () => {
    const c = await montaCenario();
    try {
      const { data: reg } = await registrar(c.gestao.client, c.schoolA);
      const { id, token } = um(reg);

      for (const u of [c.recepcao, c.admin, c.gestaoB]) {
        expect((await u.client.rpc('girar_token_dispositivo_acesso', { p_id: id })).error).toBeTruthy();
        expect((await u.client.rpc('definir_status_dispositivo_acesso', { p_id: id, p_status: 'active' })).error).toBeTruthy();
      }
      expect((await c.anon.rpc('girar_token_dispositivo_acesso', { p_id: id })).error).toBeTruthy();

      expect((await c.gestao.client.rpc('definir_status_dispositivo_acesso', { p_id: id, p_status: 'bogus' })).error).toBeTruthy();
      expect((await c.gestao.client.rpc('definir_status_dispositivo_acesso', { p_id: id, p_status: 'active' })).error).toBeNull();

      const { data: novo, error } = await c.gestao.client.rpc('girar_token_dispositivo_acesso', { p_id: id });
      expect(error).toBeNull();
      expect(novo).toHaveLength(64);
      expect(novo).not.toBe(token);

      const { data: velho } = await adminClient.rpc('autenticar_dispositivo_acesso', { p_token: token });
      expect(velho || []).toHaveLength(0);
      const { data: atual } = await adminClient.rpc('autenticar_dispositivo_acesso', { p_token: novo });
      expect(um(atual)?.id).toBe(id);
    } finally { await c.limpar(); }
  });

  it('funções do equipamento: só service_role (usuário logado e anon são recusados)', async () => {
    const c = await montaCenario();
    try {
      const { data: reg } = await registrar(c.gestao.client, c.schoolA);
      const { id, token } = um(reg);
      for (const cli of [c.gestao.client, c.recepcao.client, c.anon]) {
        expect((await cli.rpc('autenticar_dispositivo_acesso', { p_token: token })).error).toBeTruthy();
        expect((await cli.rpc('registrar_evento_dispositivo', { p_device_ref: id, p_event_type: 'alive', p_dedupe_key: 'k' })).error).toBeTruthy();
      }
    } finally { await c.limpar(); }
  });

  it('autenticação: token errado, formato inválido, desativado e deviceId diferente não passam', async () => {
    const c = await montaCenario();
    try {
      const { data: reg } = await registrar(c.gestao.client, c.schoolA);
      const { id, token } = um(reg);
      const auth = (p) => adminClient.rpc('autenticar_dispositivo_acesso', p);

      expect(((await auth({ p_token: 'f'.repeat(64) })).data) || []).toHaveLength(0);
      expect(((await auth({ p_token: 'curto' })).data) || []).toHaveLength(0);

      const ok = await auth({ p_token: token, p_device_id: 987001 });
      expect(um(ok.data)?.school_id).toBe(c.schoolA); // 1º contato fixa o deviceId
      expect(((await auth({ p_token: token, p_device_id: 987002 })).data) || []).toHaveLength(0);
      expect(um((await auth({ p_token: token, p_device_id: 987001 })).data)?.id).toBe(id);

      await c.gestao.client.rpc('definir_status_dispositivo_acesso', { p_id: id, p_status: 'disabled' });
      expect(((await auth({ p_token: token, p_device_id: 987001 })).data) || []).toHaveLength(0);
    } finally { await c.limpar(); }
  });

  it('um deviceId não pode pertencer a dois dispositivos (nem de escolas diferentes)', async () => {
    const c = await montaCenario();
    try {
      const a = um((await registrar(c.gestao.client, c.schoolA)).data);
      const b = um((await registrar(c.gestaoB.client, c.schoolB)).data);
      const auth = (p) => adminClient.rpc('autenticar_dispositivo_acesso', p);
      expect(um((await auth({ p_token: a.token, p_device_id: 987010 })).data)?.id).toBe(a.id);
      expect(((await auth({ p_token: b.token, p_device_id: 987010 })).data) || []).toHaveLength(0);
    } finally { await c.limpar(); }
  });

  it('evento: school_id vem do dispositivo, repetido é ignorado, desativado não grava', async () => {
    const c = await montaCenario();
    try {
      const { id } = um((await registrar(c.gestao.client, c.schoolA)).data);
      const ev = (key, extra = {}) => adminClient.rpc('registrar_evento_dispositivo', {
        p_device_ref: id, p_event_type: 'access_log', p_dedupe_key: key, p_external_user_id: 42, p_payload: { a: 1 }, ...extra,
      });
      expect((await ev('e1')).data).toBe(true);
      expect((await ev('e1')).data).toBe(false);
      const { data: linhas } = await adminClient.from('device_events').select('school_id').eq('device_ref', id);
      expect(linhas).toHaveLength(1);
      expect(linhas[0].school_id).toBe(c.schoolA);

      expect((await ev('e2', { p_event_type: 'invalido' })).error).toBeTruthy();
      expect((await ev('e3', { p_payload: { x: 'a'.repeat(20000) } })).error).toBeTruthy();

      await c.gestao.client.rpc('definir_status_dispositivo_acesso', { p_id: id, p_status: 'disabled' });
      expect((await ev('e4')).data).toBe(false);
      const { data: depois } = await adminClient.from('device_events').select('id').eq('device_ref', id);
      expect(depois).toHaveLength(1);
    } finally { await c.limpar(); }
  });
});
