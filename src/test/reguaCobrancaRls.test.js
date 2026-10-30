import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Régua de cobrança (PLANO_EXPANSAO_GESTAO.md, item 14): só a Gestão com o módulo ligado edita
// regras e modelos; envios só leitura; cada família cuida só da própria preferência; isolamento entre escolas.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario({ modulo = true } = {}) {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  if (modulo) await adminClient.from('schools').update({ features_enabled: { regua_cobranca: true } }).eq('id', schoolA);
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const coordenacao = await createTestUser({ role: 'gestao_pedagogica', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const outraFamilia = await createTestUser({ role: 'family', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
  const limpar = async () => {
    for (const t of ['billing_dispatches', 'billing_channel_prefs', 'billing_message_templates', 'billing_rules']) {
      await adminClient.from(t).delete().eq('school_id', schoolA);
    }
    for (const u of [gestao, coordenacao, recepcao, familia, outraFamilia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, coordenacao, recepcao, familia, outraFamilia, gestaoB, limpar };
}

const regra = (c, extra = {}) => ({
  school_id: c.schoolA, ativa: true, passos: [{ dias: -3, canais: ['push', 'email'] }, { dias: 3, canais: ['email'] }], ...extra,
});

runIf('Régua de cobrança · RLS e regras', () => {
  it('Gestão salva regra e modelo; Recepção, Coordenação, família e outra escola não leem nem escrevem', async () => {
    const c = await montaCenario();
    try {
      const { error } = await c.gestao.client.from('billing_rules').insert(regra(c));
      expect(error).toBeNull();
      const { error: eModelo } = await c.gestao.client.from('billing_message_templates')
        .insert({ school_id: c.schoolA, canal: 'email', dias: -3, assunto: 'Lembrete', texto: 'Olá {responsavel}' });
      expect(eModelo).toBeNull();
      for (const u of [c.recepcao, c.coordenacao, c.familia, c.gestaoB]) {
        const { data } = await u.client.from('billing_rules').select('school_id');
        expect(data || []).toHaveLength(0);
        const { data: m } = await u.client.from('billing_message_templates').select('id');
        expect(m || []).toHaveLength(0);
        const { error: eIns } = await u.client.from('billing_rules').insert(regra(c, { school_id: c.schoolA }));
        expect(eIns).not.toBeNull();
      }
    } finally { await c.limpar(); }
  });

  it('com o módulo desligado nem a Gestão escreve', async () => {
    const c = await montaCenario({ modulo: false });
    try {
      const { error } = await c.gestao.client.from('billing_rules').insert(regra(c));
      expect(error).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('passos inválidos são recusados pelo banco', async () => {
    const c = await montaCenario();
    try {
      const ruins = [
        [{ dias: 1, canais: ['whatsapp'] }],
        [{ dias: 1, canais: ['push'] }, { dias: 1, canais: ['email'] }],
        [{ dias: 99, canais: ['push'] }],
        [{ dias: 1, canais: [] }],
        Array.from({ length: 11 }, (_, i) => ({ dias: i, canais: ['push'] })),
      ];
      for (const passos of ruins) {
        const { error } = await c.gestao.client.from('billing_rules').upsert(regra(c, { passos }), { onConflict: 'school_id' });
        expect(error).not.toBeNull();
      }
    } finally { await c.limpar(); }
  });

  it('envios: Gestão só lê e a chave única impede repetir', async () => {
    const c = await montaCenario();
    try {
      const { data: aluno } = await adminClient.from('students').insert({ school_id: c.schoolA, name: 'Vitest Aluno', family_id: c.familia.id }).select('id').single();
      const { data: cobranca, error: cErr } = await adminClient.from('financial_charges')
        .insert({ school_id: c.schoolA, student_id: aluno.id, family_id: c.familia.id, due_date: '2026-12-10', available_from: '2026-12-01', amount_cents: 85000 })
        .select('id').single();
      expect(cErr).toBeNull();
      const envio = { school_id: c.schoolA, charge_id: cobranca.id, dias: -3, canal: 'email', status: 'enviado' };
      expect((await adminClient.from('billing_dispatches').insert(envio)).error).toBeNull();
      expect((await adminClient.from('billing_dispatches').insert(envio)).error).not.toBeNull();

      const { data: lido } = await c.gestao.client.from('billing_dispatches').select('id');
      expect(lido).toHaveLength(1);
      expect((await c.gestao.client.from('billing_dispatches').insert({ ...envio, dias: 3 })).error).not.toBeNull();
      await c.gestao.client.from('billing_dispatches').delete().eq('school_id', c.schoolA);
      const { data: ainda } = await adminClient.from('billing_dispatches').select('id').eq('school_id', c.schoolA);
      expect(ainda).toHaveLength(1);
      for (const u of [c.familia, c.recepcao, c.gestaoB]) {
        const { data } = await u.client.from('billing_dispatches').select('id');
        expect(data || []).toHaveLength(0);
      }
      await adminClient.from('billing_dispatches').delete().eq('school_id', c.schoolA);
      await adminClient.from('financial_charges').delete().eq('id', cobranca.id);
      await adminClient.from('students').delete().eq('id', aluno.id);
    } finally { await c.limpar(); }
  });

  it('família cuida só da própria preferência de canal', async () => {
    const c = await montaCenario();
    try {
      const { error } = await c.familia.client.from('billing_channel_prefs')
        .upsert({ user_id: c.familia.id, school_id: c.schoolA, canal: 'email', optou_sair: true }, { onConflict: 'user_id,canal' });
      expect(error).toBeNull();
      const { data: minha } = await c.familia.client.from('billing_channel_prefs').select('canal, optou_sair');
      expect(minha).toEqual([{ canal: 'email', optou_sair: true }]);
      const { data: alheia } = await c.outraFamilia.client.from('billing_channel_prefs').select('canal');
      expect(alheia || []).toHaveLength(0);
      const { error: eOutro } = await c.outraFamilia.client.from('billing_channel_prefs')
        .upsert({ user_id: c.familia.id, school_id: c.schoolA, canal: 'push', optou_sair: true }, { onConflict: 'user_id,canal' });
      expect(eOutro).not.toBeNull();
      const { error: eEscola } = await c.familia.client.from('billing_channel_prefs')
        .upsert({ user_id: c.familia.id, school_id: c.schoolB, canal: 'push', optou_sair: true }, { onConflict: 'user_id,canal' });
      expect(eEscola).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('WhatsApp pelo Asaas: família grava o opt out; só a Gestão liga o interruptor e lê a sincronia', async () => {
    const c = await montaCenario();
    try {
      const { error } = await c.familia.client.from('billing_channel_prefs')
        .upsert({ user_id: c.familia.id, school_id: c.schoolA, canal: 'whatsapp', optou_sair: true }, { onConflict: 'user_id,canal' });
      expect(error).toBeNull();
      const { error: eRuim } = await c.familia.client.from('billing_channel_prefs')
        .upsert({ user_id: c.familia.id, school_id: c.schoolA, canal: 'sms', optou_sair: true }, { onConflict: 'user_id,canal' });
      expect(eRuim).not.toBeNull();
      await c.gestao.client.from('billing_rules').insert(regra(c, { ativa: false, passos: [], whatsapp_asaas: true }));
      const { data: r } = await c.gestao.client.from('billing_rules').select('whatsapp_asaas');
      expect(r).toEqual([{ whatsapp_asaas: true }]);
      await adminClient.from('asaas_whatsapp_sync').insert({ school_id: c.schoolA, customer_id: 'cus_teste123', aplicado: true });
      const { data: g } = await c.gestao.client.from('asaas_whatsapp_sync').select('customer_id');
      expect(g).toHaveLength(1);
      for (const u of [c.familia, c.recepcao, c.coordenacao, c.gestaoB]) {
        const { data } = await u.client.from('asaas_whatsapp_sync').select('customer_id');
        expect(data || []).toHaveLength(0);
      }
      expect((await c.gestao.client.from('asaas_whatsapp_sync').delete().eq('school_id', c.schoolA)).error).toBeNull();
      const { data: ainda } = await adminClient.from('asaas_whatsapp_sync').select('customer_id').eq('school_id', c.schoolA);
      expect(ainda).toHaveLength(1);
    } finally {
      await adminClient.from('asaas_whatsapp_sync').delete().eq('school_id', c.schoolA);
      await c.limpar();
    }
  });
});
