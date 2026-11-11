import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';
import { eventoPedeCheckin } from '../../supabase/functions/controlid-push/parser.ts';

const ev = (over = {}) => ({ event_type: 'access_log', dedupe_key: 'k', device_time: null, external_user_id: 10, payload: { event: 7 }, ...over });

describe('eventoPedeCheckin (fase 6)', () => {
  it('acesso liberado com usuário identificado pede check-in', () => {
    expect(eventoPedeCheckin(ev())).toBe(true);
  });
  it('não identificado, negado, outro tipo ou sem usuário não pedem', () => {
    expect(eventoPedeCheckin(ev({ external_user_id: null }))).toBe(false);
    expect(eventoPedeCheckin(ev({ payload: { event: 3 } }))).toBe(false);
    expect(eventoPedeCheckin(ev({ payload: { event: 6 } }))).toBe(false);
    expect(eventoPedeCheckin(ev({ event_type: 'door' }))).toBe(false);
  });
});

// Integração (precisa de Supabase local): função solicitar_checkin_dispositivo.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('solicitar_checkin_dispositivo (fase 6)', () => {
  async function cenario(filhos = 1) {
    const schoolA = await createTestSchool();
    const schoolB = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
    const familia = await createTestUser({ role: 'family', schoolId: schoolA });
    const { data: reg } = await gestao.client.rpc('registrar_dispositivo_acesso', { p_school_id: schoolA, p_name: 'iDFace' });
    const deviceRef = (Array.isArray(reg) ? reg[0] : reg).id;
    await adminClient.from('access_devices').update({ status: 'active' }).eq('id', deviceRef);
    const { data: pessoa } = await adminClient.from('authorized_persons')
      .insert({ name: 'Tia', relation: 'tia', school_id: schoolA, status: 'approved', family_id: familia.id }).select('id').single();
    const { error: vErr } = await gestao.client.rpc('vincular_pessoa_dispositivo', { p_device_ref: deviceRef, p_external_user_id: 10, p_authorized_person_id: pessoa.id });
    if (vErr) throw vErr;
    const alunos = [];
    for (let i = 0; i < filhos; i++) {
      const { data: a } = await adminClient.from('students')
        .insert({ name: `Aluno ${i}`, school_id: schoolA, family_id: familia.id, status: 'idle' }).select('id').single();
      alunos.push(a.id);
    }
    const limpar = async () => {
      await adminClient.from('students').delete().in('school_id', [schoolA, schoolB]);
      await adminClient.from('device_person_links').delete().in('school_id', [schoolA, schoolB]);
      await adminClient.from('authorized_persons').delete().in('school_id', [schoolA, schoolB]);
      await adminClient.from('access_devices').delete().in('school_id', [schoolA, schoolB]);
      for (const u of [gestao, familia]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolA);
      await deleteTestSchool(schoolB);
    };
    return { deviceRef, alunos, gestao, limpar };
  }
  const chamar = (ref, ext = 10, quando = new Date().toISOString()) =>
    adminClient.rpc('solicitar_checkin_dispositivo', { p_device_ref: ref, p_external_user_id: ext, p_device_time: quando });

  it('1 filho: vira pending_entry e depois, confirmado, pending_exit; repetido = ja_pendente', async () => {
    const c = await cenario(1);
    try {
      const r1 = await chamar(c.deviceRef);
      expect(r1.data.resultado).toBe('solicitado');
      expect(r1.data.status).toBe('pending_entry');
      const r2 = await chamar(c.deviceRef);
      expect(r2.data.resultado).toBe('ja_pendente');
      await adminClient.from('students').update({ status: 'in_school' }).eq('id', c.alunos[0]);
      const r3 = await chamar(c.deviceRef);
      expect(r3.data.status).toBe('pending_exit');
      const { data: logs } = await adminClient.from('attendance_logs').select('id').eq('student_id', c.alunos[0]);
      expect(logs).toHaveLength(0); // nunca grava histórico: quem confirma é a Recepção
    } finally { await c.limpar(); }
  });

  it('vários filhos, evento antigo, usuário sem vínculo e dispositivo desativado não solicitam', async () => {
    const c = await cenario(2);
    try {
      expect((await chamar(c.deviceRef)).data.resultado).toBe('varios_filhos');
      expect((await chamar(c.deviceRef, 10, new Date(Date.now() - 10 * 60000).toISOString())).data.resultado).toBe('evento_antigo');
      expect((await chamar(c.deviceRef, 999)).data.resultado).toBe('sem_vinculo');
      await adminClient.from('access_devices').update({ status: 'disabled' }).eq('id', c.deviceRef);
      expect((await chamar(c.deviceRef)).data.resultado).toBe('sem_vinculo');
      const { data: st } = await adminClient.from('students').select('status').in('id', c.alunos);
      expect(st.every((s) => s.status === 'idle')).toBe(true);
    } finally { await c.limpar(); }
  });

  it('só service_role executa (gestao logada não)', async () => {
    const c = await cenario(1);
    try {
      const { error } = await c.gestao.client.rpc('solicitar_checkin_dispositivo', { p_device_ref: c.deviceRef, p_external_user_id: 10, p_device_time: new Date().toISOString() });
      expect(error).toBeTruthy();
    } finally { await c.limpar(); }
  });
});
