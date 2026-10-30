import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// NFS-e (item 15): só a Gestão com o módulo ligado mexe na configuração fiscal; a nota só liga com
// serviço, ISS, confirmação e cadastro da escola completos; notas só leitura; isolamento entre escolas.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario({ modulo = true } = {}) {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  if (modulo) await adminClient.from('schools').update({ features_enabled: { nfse: true } }).eq('id', schoolA);
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
  const limpar = async () => {
    await adminClient.from('financial_invoices').delete().eq('school_id', schoolA);
    await adminClient.from('school_fiscal_config').delete().eq('school_id', schoolA);
    for (const u of [gestao, recepcao, familia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, recepcao, familia, gestaoB, limpar };
}

const config = (c, extra = {}) => ({
  school_id: c.schoolA, municipal_service_id: '1.01', municipal_service_name: 'Ensino', iss_percent: 2, ...extra,
});

runIf('NFS-e · RLS e trava de ativação', () => {
  it('Gestão grava a configuração; Recepção, família e outra escola não leem nem escrevem', async () => {
    const c = await montaCenario();
    try {
      const { error } = await c.gestao.client.from('school_fiscal_config').insert(config(c));
      expect(error).toBeNull();
      for (const u of [c.recepcao, c.familia, c.gestaoB]) {
        const { data } = await u.client.from('school_fiscal_config').select('school_id');
        expect(data || []).toHaveLength(0);
        const { error: eUp } = await u.client.from('school_fiscal_config').upsert(config(c, { iss_percent: 9 }));
        expect(eUp).not.toBeNull();
      }
    } finally { await c.limpar(); }
  });

  it('não ativa sem confirmar alíquotas nem sem IBGE e inscrição municipal da escola', async () => {
    const c = await montaCenario();
    try {
      await c.gestao.client.from('school_fiscal_config').insert(config(c));
      const semConfirmar = await c.gestao.client.from('school_fiscal_config').update({ ativo: true }).eq('school_id', c.schoolA);
      expect(semConfirmar.error).not.toBeNull();
      const semEscola = await c.gestao.client.from('school_fiscal_config')
        .update({ ativo: true, aliquotas_confirmadas_em: new Date().toISOString() }).eq('school_id', c.schoolA);
      expect(semEscola.error).not.toBeNull();
      await adminClient.from('schools').update({ codigo_ibge: '3205309', inscricao_municipal: '123' }).eq('id', c.schoolA);
      const ok = await c.gestao.client.from('school_fiscal_config')
        .update({ ativo: true, aliquotas_confirmadas_em: new Date().toISOString() }).eq('school_id', c.schoolA);
      expect(ok.error).toBeNull();
      // mudar a alíquota derruba a confirmação, e a nota continua ativa só se for reconfirmada
      const muda = await c.gestao.client.from('school_fiscal_config').update({ iss_percent: 5 }).eq('school_id', c.schoolA);
      expect(muda.error).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('com o módulo desligado nem a Gestão escreve', async () => {
    const c = await montaCenario({ modulo: false });
    try {
      const { error } = await c.gestao.client.from('school_fiscal_config').insert(config(c));
      expect(error).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('notas: Gestão lê só as da própria escola e ninguém grava pelo cliente', async () => {
    const c = await montaCenario();
    try {
      await adminClient.from('financial_invoices').insert({ school_id: c.schoolA, gateway_invoice_id: 'inv_teste_1', status: 'AUTHORIZED' });
      const { data } = await c.gestao.client.from('financial_invoices').select('id');
      expect(data || []).toHaveLength(1);
      for (const u of [c.recepcao, c.familia, c.gestaoB]) {
        const { data: d } = await u.client.from('financial_invoices').select('id');
        expect(d || []).toHaveLength(0);
      }
      const { error } = await c.gestao.client.from('financial_invoices')
        .insert({ school_id: c.schoolA, gateway_invoice_id: 'inv_teste_2', status: 'AUTHORIZED' });
      expect(error).not.toBeNull();
    } finally { await c.limpar(); }
  });
});
