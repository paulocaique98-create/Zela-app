import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { hasIntegrationCredentials, SUPABASE_URL, ANON_KEY } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Item 12 do faturamento: matriz escola A, escola B, developer e anon nas tabelas e RPCs do faturamento.
// Complementa faturamentoZelaRls (contratação e ações) com escrita direta e tabelas de apoio. Banco LOCAL.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const TABELAS_SO_DEV = ['zela_billing_eventos', 'zela_cobranca_ajustes', 'zela_ipca_anual', 'zela_reajustes_mensal', 'zela_renovacoes', 'zela_condicoes_pagamento', 'zela_config_comercial'];

runIf('Faturamento do Zela: isolamento A, B, developer e anon', () => {
  const c = {};

  beforeAll(async () => {
    c.A = await createTestSchool();
    c.B = await createTestSchool();
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestaoA = await createTestUser({ role: 'gestao', schoolId: c.A });
    c.gestaoB = await createTestUser({ role: 'gestao', schoolId: c.B });
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const { data: plano } = await adminClient.from('zela_planos').select('id').limit(1).single();
    const { data: ct, error } = await adminClient.from('school_contratacoes').insert({
      school_id: c.A, plano_id: plano.id, ciclo: 'MENSAL', meses: 1, alunos_contratados: 10, itens: [], snapshot: {},
      valor_mensal: 100, valor_ciclo: 100, implantacao_base: 0, implantacao_final: 0, status: 'ativa', inicio: hoje,
      fim: new Date(Date.now() + 300 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }),
    }).select('id').single();
    if (error) throw error;
    c.ct = ct.id;
    const { data: cob, error: e2 } = await adminClient.from('zela_cobrancas').insert({
      school_id: c.A, contratacao_id: c.ct, tipo: 'parcela', numero: 1, competencia: hoje, vencimento: hoje,
      valor_sistema: 100, valor_implantacao: 0, status: 'pendente', invoice_url: 'https://pagar.exemplo/iso',
    }).select('id').single();
    if (e2) throw e2;
    c.cob = cob.id;
  }, 120000);

  afterAll(async () => {
    for (const s of [c.A, c.B]) {
      if (!s) continue;
      await adminClient.from('zela_cobrancas').delete().eq('school_id', s);
      await adminClient.from('school_contratacoes').delete().eq('school_id', s);
      await adminClient.from('zela_bloqueios_log').delete().eq('school_id', s);
    }
    for (const u of [c.dev, c.gestaoA, c.gestaoB]) if (u?.id) await deleteTestUser(u.id);
    for (const s of [c.A, c.B]) if (s) await deleteTestSchool(s);
  }, 120000);

  it('anon não lê cobranças nem contratações', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    for (const t of ['zela_cobrancas', 'school_contratacoes', 'zela_bloqueios_log']) {
      const { data } = await anon.from(t).select('id').limit(5);
      expect(data ?? [], t).toHaveLength(0);
    }
  });

  it('escola B não lê cobrança, contratação nem trilha da escola A', async () => {
    for (const t of ['zela_cobrancas', 'school_contratacoes', 'zela_bloqueios_log']) {
      const { data } = await c.gestaoB.client.from(t).select('id').eq('school_id', c.A);
      expect(data ?? [], t).toHaveLength(0);
    }
  });

  it('a escola não escreve direto: insert, update e delete em cobranças e contratações', async () => {
    const ins = await c.gestaoA.client.from('zela_cobrancas').insert({
      school_id: c.A, contratacao_id: c.ct, tipo: 'parcela', numero: 9, competencia: '2026-01-01', vencimento: '2026-01-01',
      valor_sistema: 1, valor_implantacao: 0, status: 'paga',
    }).select('id');
    expect(ins.error ?? (ins.data?.length ? null : 'vazio')).not.toBeNull();
    const upd = await c.gestaoA.client.from('zela_cobrancas').update({ valor_sistema: 1, status: 'paga' }).eq('id', c.cob).select('id');
    expect(upd.data ?? []).toHaveLength(0);
    const del = await c.gestaoA.client.from('zela_cobrancas').delete().eq('id', c.cob).select('id');
    expect(del.data ?? []).toHaveLength(0);
    const ct = await c.gestaoA.client.from('school_contratacoes').update({ status: 'cancelada' }).eq('id', c.ct).select('id');
    expect(ct.data ?? []).toHaveLength(0);
    const { data: depois } = await adminClient.from('zela_cobrancas').select('status, valor_sistema').eq('id', c.cob).single();
    expect(depois).toEqual({ status: 'pendente', valor_sistema: 100 });
  });

  it('outra escola também não escreve na cobrança da A', async () => {
    const upd = await c.gestaoB.client.from('zela_cobrancas').update({ status: 'paga' }).eq('id', c.cob).select('id');
    expect(upd.data ?? []).toHaveLength(0);
    const del = await c.gestaoB.client.from('zela_cobrancas').delete().eq('id', c.cob).select('id');
    expect(del.data ?? []).toHaveLength(0);
  });

  it('tabelas internas (eventos, ajustes, IPCA, reajustes, renovações, condições, config) só o developer lê', async () => {
    for (const t of TABELAS_SO_DEV) {
      const g = await c.gestaoA.client.from(t).select('*', { count: 'exact', head: true });
      expect(g.count ?? 0, `${t} (gestão)`).toBe(0);
      const anon = await createClient(SUPABASE_URL, ANON_KEY).from(t).select('*', { count: 'exact', head: true });
      expect(anon.count ?? 0, `${t} (anon)`).toBe(0);
    }
    const { count } = await c.dev.client.from('zela_condicoes_pagamento').select('*', { count: 'exact', head: true });
    expect(count).toBeGreaterThan(0);
  });

  it('a escola não grava nas tabelas internas', async () => {
    const e = await c.gestaoA.client.from('zela_billing_eventos').insert({ event_id: 'evt_iso_x', evento: 'PAYMENT_RECEIVED', payload: {} }).select('id');
    expect(e.error ?? (e.data?.length ? null : 'vazio')).not.toBeNull();
    const i = await c.gestaoA.client.from('zela_ipca_anual').insert({ ano: 2099, percentual: 1 }).select('ano');
    expect(i.error ?? (i.data?.length ? null : 'vazio')).not.toBeNull();
  });

  it('developer lê as cobranças de todas as escolas, a escola A só as próprias', async () => {
    const dev = await c.dev.client.from('zela_cobrancas').select('id').eq('id', c.cob);
    expect(dev.data).toHaveLength(1);
    const a = await c.gestaoA.client.from('zela_cobrancas').select('school_id').limit(50);
    expect(a.data.length).toBeGreaterThan(0);
    expect(a.data.every(x => x.school_id === c.A)).toBe(true);
  });

  it('RPCs da escola: anon recusado; B não enxerga dados da A; developer recebe vazio', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    for (const f of ['meu_aviso_atraso', 'meu_estado_bloqueio', 'minhas_parcelas_zela']) {
      const r = await anon.rpc(f);
      expect(r.error, f).not.toBeNull();
    }
    const b = await c.gestaoB.client.rpc('minhas_parcelas_zela');
    expect(JSON.stringify(b.data ?? [])).not.toContain('pagar.exemplo/iso');
    const d = await c.dev.client.rpc('minhas_parcelas_zela');
    expect(d.data ?? []).toHaveLength(0);
  });

  it('escola_liberada e a rotina não são chamáveis pelo app', async () => {
    const r1 = await c.gestaoA.client.rpc('escola_liberada', { p_school_id: c.A });
    expect(r1.error).not.toBeNull();
    const r2 = await c.gestaoA.client.rpc('zela_faturamento_rotina');
    expect(r2.error).not.toBeNull();
    const r3 = await c.dev.client.rpc('zela_faturamento_rotina');
    expect(r3.error).not.toBeNull();
  });
});
