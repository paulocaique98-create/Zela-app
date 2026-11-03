import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Faturamento do Zela Edu (etapa D): IPCA, reajuste do Mensal (trava), renovação do Anual em rascunho e
// rotina diária (vencida e suspensão por carência). Roda contra o Supabase LOCAL (Docker).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const ANO_IPCA = 2099; // ano de teste: não colide com índice real
const dia = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

runIf('Faturamento do Zela (IPCA, renovação e rotina)', () => {
  const c = {};

  beforeAll(async () => {
    c.anual = await createTestSchool();
    c.mensal = await createTestSchool();
    for (const s of [c.anual, c.mensal]) {
      await adminClient.from('schools').update({ cnpj: '11222333000181', email: 'a@teste.com' }).eq('id', s);
    }
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.gestao = await createTestUser({ role: 'gestao', schoolId: c.anual });

    const { data: plano, error } = await adminClient.from('zela_planos').select('id').eq('modalidade', 'pacote').eq('ativo', true).order('ordem').limit(1).single();
    if (error) throw error;
    c.plano = plano.id;
    const { data: faixa } = await adminClient.from('zela_pacote_faixas').select('faixa').eq('plano_id', c.plano).order('faixa').limit(1).maybeSingle();
    c.alunos = faixa?.faixa ?? 20;
  }, 120000);

  afterAll(async () => {
    await adminClient.from('zela_renovacoes').delete().in('school_id', [c.anual, c.mensal].filter(Boolean));
    for (const s of [c.anual, c.mensal]) {
      if (!s) continue;
      await adminClient.from('school_contratacoes').delete().eq('school_id', s);
      await adminClient.from('school_feature_changes').delete().eq('school_id', s);
    }
    await adminClient.from('zela_ipca_anual').delete().eq('ano', ANO_IPCA);
    for (const u of [c.dev, c.gestao]) if (u?.id) await deleteTestUser(u.id);
    for (const s of [c.anual, c.mensal]) if (s) await deleteTestSchool(s);
  }, 120000);

  const contratar = (school, condicao) => c.dev.client.rpc('contratar_plano_com_condicao', {
    p_school_id: school, p_plano_id: c.plano, p_condicao: condicao, p_alunos: c.alunos,
  });

  it('IPCA: só o developer registra e lê; a Gestão é recusada e não vê a tabela', async () => {
    const recusa = await c.gestao.client.rpc('zela_ipca_registrar', { p_ano: ANO_IPCA, p_percentual: 4.5 });
    expect(recusa.error).not.toBeNull();
    const fora = await c.dev.client.rpc('zela_ipca_registrar', { p_ano: ANO_IPCA, p_percentual: 99 });
    expect(fora.error?.message).toMatch(/entre 0 e 30/);
    const ok = await c.dev.client.rpc('zela_ipca_registrar', { p_ano: ANO_IPCA, p_percentual: 4.5 });
    expect(ok.error).toBeNull();
    const lido = await c.dev.client.from('zela_ipca_anual').select('percentual').eq('ano', ANO_IPCA).single();
    expect(Number(lido.data.percentual)).toBe(4.5);
    const gestao = await c.gestao.client.from('zela_ipca_anual').select('ano').limit(5);
    expect(gestao.data).toHaveLength(0);
  });

  it('Anual: valor travado, o reajuste durante a vigência é recusado', async () => {
    const { data: id, error } = await contratar(c.anual, 'anual_vista');
    expect(error).toBeNull();
    c.ctAnual = id;
    await adminClient.rpc('zela_ativar_contratacao', { p_contratacao_id: id });
    const r = await c.dev.client.rpc('zela_reajuste_mensal_registrar', { p_contratacao_id: id, p_ano_ipca: ANO_IPCA, p_percentual: 4 });
    expect(r.error?.message).toMatch(/Anual o valor fica travado/);
  });

  it('Mensal: trava de 12 meses, teto do IPCA, registro de quem reajustou', async () => {
    const { data: id, error } = await contratar(c.mensal, 'mensal');
    expect(error).toBeNull();
    c.ctMensal = id;
    await adminClient.rpc('zela_ativar_contratacao', { p_contratacao_id: id });
    const args = (p) => ({ p_contratacao_id: id, p_ano_ipca: ANO_IPCA, p_percentual: p });

    const semSub = await c.dev.client.rpc('zela_reajuste_mensal_registrar', args(4));
    expect(semSub.error?.message).toMatch(/não tem assinatura/);
    await adminClient.from('school_contratacoes').update({ asaas_subscription_id: `sub_teste_${Date.now()}` }).eq('id', id);

    const cedo = await c.dev.client.rpc('zela_reajuste_mensal_registrar', args(4));
    expect(cedo.error?.message).toMatch(/12 meses depois do início/);

    await adminClient.from('school_contratacoes').update({ inicio: dia(-400) }).eq('id', id);
    const acima = await c.dev.client.rpc('zela_reajuste_mensal_registrar', args(5));
    expect(acima.error?.message).toMatch(/não pode passar do IPCA/);
    const zero = await c.dev.client.rpc('zela_reajuste_mensal_registrar', args(0));
    expect(zero.error).not.toBeNull();

    const { data: antes } = await adminClient.from('zela_cobrancas').select('valor_sistema').eq('contratacao_id', id).eq('numero', 1).single();
    const ok = await c.dev.client.rpc('zela_reajuste_mensal_registrar', args(4));
    expect(ok.error).toBeNull();
    expect(Number(ok.data.valor_anterior)).toBe(Number(antes.valor_sistema));
    expect(Number(ok.data.valor_novo)).toBe(Math.round(Number(antes.valor_sistema) * 1.04 * 100) / 100);

    const { data: log } = await adminClient.from('zela_reajustes_mensal').select('aplicado_por, sincronizado_asaas').eq('id', ok.data.reajuste_id).single();
    expect(log.aplicado_por).toBe(c.dev.id);
    expect(log.sincronizado_asaas).toBe(false);

    const dois = await c.dev.client.rpc('zela_reajuste_mensal_registrar', args(1));
    expect(dois.error?.message).toMatch(/12 meses depois do início ou do último reajuste/);

    const mudar = await c.dev.client.rpc('zela_ipca_registrar', { p_ano: ANO_IPCA, p_percentual: 3 });
    expect(mudar.error?.message).toMatch(/já foi usado/);
  });

  it('rotina: cobrança vencida há mais que a carência suspende o contrato e tira a escola do ar', async () => {
    const { data: cfg } = await adminClient.from('zela_config_comercial').select('carencia_dias').eq('id', true).single();
    const { data: cob } = await adminClient.from('zela_cobrancas').select('id').eq('contratacao_id', c.ctMensal).eq('numero', 1).single();
    await adminClient.from('zela_cobrancas').update({ status: 'pendente', vencimento: dia(-(cfg.carencia_dias - 2)) }).eq('id', cob.id);

    const r1 = await adminClient.rpc('zela_faturamento_rotina');
    expect(r1.error).toBeNull();
    const dentro = await adminClient.from('school_contratacoes').select('status').eq('id', c.ctMensal).single();
    expect(dentro.data.status).toBe('ativa');
    const cobDentro = await adminClient.from('zela_cobrancas').select('status').eq('id', cob.id).single();
    expect(cobDentro.data.status).toBe('vencida');

    await adminClient.from('zela_cobrancas').update({ vencimento: dia(-(cfg.carencia_dias + 1)) }).eq('id', cob.id);
    const r2 = await adminClient.rpc('zela_faturamento_rotina');
    expect(r2.error).toBeNull();
    const fora = await adminClient.from('school_contratacoes').select('status').eq('id', c.ctMensal).single();
    expect(fora.data.status).toBe('suspensa');
    const escola = await adminClient.from('schools').select('is_active').eq('id', c.mensal).single();
    expect(escola.data.is_active).toBe(false);
  });

  it('rotina e funções de rotina não são chamáveis por usuário comum', async () => {
    const r = await c.dev.client.rpc('zela_faturamento_rotina');
    expect(r.error).not.toBeNull();
  });

  it('Anual: perto do fim a rotina cria rascunho com IPCA; confirmar gera contrato reajustado sem implantação', async () => {
    await adminClient.from('school_contratacoes').update({ fim: dia(30) }).eq('id', c.ctAnual);
    const { data: base } = await adminClient.from('school_contratacoes').select('valor_mensal').eq('id', c.ctAnual).single();

    const rot = await adminClient.rpc('zela_faturamento_rotina');
    expect(rot.error).toBeNull();
    const { data: rasc } = await adminClient.from('zela_renovacoes').select('id, status, ipca_percent, novo_mensal').eq('origem_id', c.ctAnual).single();
    expect(rasc.status).toBe('rascunho');
    expect(Number(rasc.novo_mensal)).toBe(Math.round(Number(base.valor_mensal) * 1.045 * 100) / 100);

    // Segunda rodada não duplica.
    await adminClient.rpc('zela_faturamento_rotina');
    const { data: todas } = await adminClient.from('zela_renovacoes').select('id').eq('origem_id', c.ctAnual);
    expect(todas).toHaveLength(1);

    const semPerm = await c.gestao.client.rpc('zela_renovacao_confirmar', { p_renovacao_id: rasc.id });
    expect(semPerm.error).not.toBeNull();

    const conf = await c.dev.client.rpc('zela_renovacao_confirmar', { p_renovacao_id: rasc.id });
    expect(conf.error).toBeNull();
    const { data: nova } = await adminClient.from('school_contratacoes')
      .select('status, valor_mensal, valor_ciclo, implantacao_final, inicio').eq('id', conf.data).single();
    expect(nova.status).toBe('aguardando_pagamento');
    expect(Number(nova.valor_mensal)).toBe(Number(rasc.novo_mensal));
    expect(Number(nova.implantacao_final)).toBe(0);
    const { data: cobs } = await adminClient.from('zela_cobrancas').select('valor, valor_implantacao').eq('contratacao_id', conf.data);
    expect(cobs.every(x => Number(x.valor_implantacao) === 0)).toBe(true);
    const soma = cobs.reduce((s, x) => s + Number(x.valor), 0);
    expect(Math.round(soma * 100)).toBe(Math.round(Number(nova.valor_ciclo) * 100));
    // O contrato em vigência não muda de valor até a nova ser paga.
    const { data: velho } = await adminClient.from('school_contratacoes').select('status, valor_mensal').eq('id', c.ctAnual).single();
    expect(velho.status).toBe('ativa');
    expect(Number(velho.valor_mensal)).toBe(Number(base.valor_mensal));

    const de_novo = await c.dev.client.rpc('zela_renovacao_confirmar', { p_renovacao_id: rasc.id });
    expect(de_novo.error?.message).toMatch(/já confirmada/);
  });
});
