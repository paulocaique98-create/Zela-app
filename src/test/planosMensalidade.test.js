import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Planos de mensalidade (04/10/2026): tabela de preços, condição da família
// (bolsista) e configurações da criação automática. Tudo só da Gestão da
// própria escola; nenhuma outra função enxerga ou grava.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Planos de mensalidade · permissões e regras do banco', () => {
  const ctx = { usuarios: [] };
  const preco = (extra = {}) => ({ school_year: 2026, ciclo_horas: 6, turno: 'Matutino', monthly_amount_cents: 120000, ...extra });

  beforeAll(async () => {
    ctx.escola = await createTestSchool('Vitest Planos');
    ctx.outraEscola = await createTestSchool('Vitest Planos Outra');
    ctx.gestao = await createTestUser({ role: 'gestao', schoolId: ctx.escola });
    ctx.outraGestao = await createTestUser({ role: 'gestao', schoolId: ctx.outraEscola });
    ctx.recepcao = await createTestUser({ role: 'admin', schoolId: ctx.escola });
    ctx.pedagogica = await createTestUser({ role: 'gestao_pedagogica', schoolId: ctx.escola });
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.escola });
    ctx.familiaDeFora = await createTestUser({ role: 'family', schoolId: ctx.outraEscola });
    ctx.usuarios = [ctx.gestao, ctx.outraGestao, ctx.recepcao, ctx.pedagogica, ctx.familia, ctx.familiaDeFora];
  }, 90000);

  afterAll(async () => {
    await adminClient.from('school_plan_prices').delete().in('school_id', [ctx.escola, ctx.outraEscola]);
    await adminClient.from('financial_guardian_conditions').delete().in('school_id', [ctx.escola, ctx.outraEscola]);
    await adminClient.from('school_financial_settings').delete().in('school_id', [ctx.escola, ctx.outraEscola]);
    for (const u of ctx.usuarios) await deleteTestUser(u.id);
    await deleteTestSchool(ctx.escola);
    await deleteTestSchool(ctx.outraEscola);
  }, 90000);

  it('a Gestão grava, lê e reajusta o preço; um por ano, ciclo e turno', async () => {
    const { error } = await ctx.gestao.client.from('school_plan_prices').insert({ school_id: ctx.escola, ...preco() });
    expect(error).toBeNull();
    const { error: duplicado } = await ctx.gestao.client.from('school_plan_prices').insert({ school_id: ctx.escola, ...preco() });
    expect(duplicado).not.toBeNull();
    const { error: upsertError } = await ctx.gestao.client.from('school_plan_prices')
      .upsert({ school_id: ctx.escola, ...preco({ monthly_amount_cents: 125000 }) }, { onConflict: 'school_id,school_year,ciclo_horas,turno' });
    expect(upsertError).toBeNull();
    const { data } = await ctx.gestao.client.from('school_plan_prices').select('monthly_amount_cents, updated_by').eq('school_id', ctx.escola);
    expect(data).toHaveLength(1);
    expect(data[0].monthly_amount_cents).toBe(125000);
    expect(data[0].updated_by).toBe(ctx.gestao.id); // carimbado no servidor
  }, 30000);

  it('o banco recusa ciclo, turno e valor fora do combinado', async () => {
    for (const ruim of [{ ciclo_horas: 7 }, { turno: 'Integral' }, { monthly_amount_cents: 0 }, { monthly_amount_cents: -5 }, { school_year: 1999 }]) {
      const { error } = await ctx.gestao.client.from('school_plan_prices').insert({ school_id: ctx.escola, ...preco({ ciclo_horas: 8, ...ruim }) });
      expect(error, JSON.stringify(ruim)).not.toBeNull();
    }
  }, 30000);

  it('ninguém além da Gestão da escola lê ou grava preços', async () => {
    for (const quem of [ctx.recepcao, ctx.pedagogica, ctx.familia, ctx.outraGestao]) {
      const { data } = await quem.client.from('school_plan_prices').select('id').eq('school_id', ctx.escola);
      expect(data ?? []).toEqual([]);
      const { error } = await quem.client.from('school_plan_prices').insert({ school_id: ctx.escola, ...preco({ ciclo_horas: 10 }) });
      expect(error).not.toBeNull();
    }
    // Gestão não grava preço em outra escola.
    const { error } = await ctx.gestao.client.from('school_plan_prices').insert({ school_id: ctx.outraEscola, ...preco({ ciclo_horas: 10 }) });
    expect(error).not.toBeNull();
    // Nem apaga o que não é da sua escola.
    await adminClient.from('school_plan_prices').insert({ school_id: ctx.outraEscola, ...preco() });
    await ctx.gestao.client.from('school_plan_prices').delete().eq('school_id', ctx.outraEscola);
    const { data: ainda } = await adminClient.from('school_plan_prices').select('id').eq('school_id', ctx.outraEscola);
    expect(ainda).toHaveLength(1);
  }, 30000);

  it('condição da família: a Gestão marca bolsista; só ela e quem gera contrato leem', async () => {
    const { error } = await ctx.gestao.client.from('financial_guardian_conditions')
      .upsert({ school_id: ctx.escola, guardian_id: ctx.familia.id, bolsista: true, observacao: '  bolsa integral 2026  ' }, { onConflict: 'school_id,guardian_id' });
    expect(error).toBeNull();
    const { data } = await ctx.gestao.client.from('financial_guardian_conditions').select('bolsista, observacao, updated_by').eq('guardian_id', ctx.familia.id).single();
    expect(data).toEqual({ bolsista: true, observacao: 'bolsa integral 2026', updated_by: ctx.gestao.id });

    for (const quem of [ctx.recepcao, ctx.pedagogica, ctx.familia]) {
      const { data: lido } = await quem.client.from('financial_guardian_conditions').select('bolsista').eq('school_id', ctx.escola);
      expect(lido ?? []).toEqual([]);
      const { error: gravou } = await quem.client.from('financial_guardian_conditions').update({ bolsista: false }).eq('guardian_id', ctx.familia.id);
      void gravou;
    }
    const { data: depois } = await adminClient.from('financial_guardian_conditions').select('bolsista').eq('guardian_id', ctx.familia.id).single();
    expect(depois.bolsista).toBe(true);

    // Responsável de outra escola não entra na condição desta.
    const { error: deFora } = await ctx.gestao.client.from('financial_guardian_conditions')
      .insert({ school_id: ctx.escola, guardian_id: ctx.familiaDeFora.id, bolsista: true });
    expect(deFora).not.toBeNull();
  }, 30000);

  it('criação automática nasce desligada e só a Gestão mexe', async () => {
    const { error } = await ctx.gestao.client.from('school_financial_settings').insert({ school_id: ctx.escola });
    expect(error).toBeNull();
    const { data } = await ctx.gestao.client.from('school_financial_settings').select('*').eq('school_id', ctx.escola).single();
    expect(data).toMatchObject({ auto_create_on_approval: false, default_due_day: 10, default_billing_type: 'UNDEFINED' });
    for (const ruim of [{ default_due_day: 0 }, { default_due_day: 29 }, { default_billing_type: 'CREDIT_CARD' }]) {
      const { error: e } = await ctx.gestao.client.from('school_financial_settings').update(ruim).eq('school_id', ctx.escola);
      expect(e, JSON.stringify(ruim)).not.toBeNull();
    }
    for (const quem of [ctx.recepcao, ctx.familia, ctx.outraGestao]) {
      const { data: lido } = await quem.client.from('school_financial_settings').select('school_id').eq('school_id', ctx.escola);
      expect(lido ?? []).toEqual([]);
      await quem.client.from('school_financial_settings').update({ auto_create_on_approval: true }).eq('school_id', ctx.escola);
    }
    const { data: depois } = await adminClient.from('school_financial_settings').select('auto_create_on_approval').eq('school_id', ctx.escola).single();
    expect(depois.auto_create_on_approval).toBe(false);
  }, 30000);

  it('mensalidade guarda ciclo, turno, ano e origem do preço, com valores válidos', async () => {
    const { data: aluno } = await adminClient.from('students').insert({ name: 'Vitest Aluno Plano', school_id: ctx.escola, family_id: ctx.familia.id, contracted_hours: 8, turno: 'Vespertino' }).select('id').single();
    try {
      const base = { school_id: ctx.escola, student_id: aluno.id, financial_guardian_id: ctx.familia.id, billing_cycle: 'MONTHLY', base_monthly_amount_cents: 100000, amount_cents: 100000, first_due_date: '2026-11-10' };
      const { error: ruim } = await adminClient.from('financial_contracts').insert({ ...base, ciclo_horas: 7 });
      expect(ruim).not.toBeNull();
      const { error: origemRuim } = await adminClient.from('financial_contracts').insert({ ...base, price_source: 'chute' });
      expect(origemRuim).not.toBeNull();
      const { data, error } = await adminClient.from('financial_contracts').insert({ ...base, ciclo_horas: 8, turno: 'Vespertino', school_year: 2026, price_source: 'tabela' }).select('ciclo_horas, turno, school_year, price_source').single();
      expect(error).toBeNull();
      expect(data).toEqual({ ciclo_horas: 8, turno: 'Vespertino', school_year: 2026, price_source: 'tabela' });
      const { data: padrao } = await adminClient.from('financial_contracts').update({ status: 'cancelled' }).eq('student_id', aluno.id).select('price_source').single();
      expect(padrao.price_source).toBe('tabela');
    } finally {
      await adminClient.from('financial_contracts').delete().eq('student_id', aluno.id);
      await adminClient.from('students').delete().eq('id', aluno.id);
    }
  }, 30000);

  it('cobrança guarda o valor original ao ser ajustada, nunca zerada', async () => {
    const { data: aluno } = await adminClient.from('students').insert({ name: 'Vitest Aluno Cobranca', school_id: ctx.escola, family_id: ctx.familia.id }).select('id').single();
    try {
      const base = { school_id: ctx.escola, student_id: aluno.id, family_id: ctx.familia.id, due_date: '2026-11-10', available_from: '2026-10-10', amount_cents: 100000 };
      const { error: zero } = await adminClient.from('financial_charges').insert({ ...base, original_amount_cents: 0 });
      expect(zero).not.toBeNull();
      const { data, error } = await adminClient.from('financial_charges').insert({ ...base, original_amount_cents: 120000, adjusted_at: new Date().toISOString() }).select('original_amount_cents').single();
      expect(error).toBeNull();
      expect(data.original_amount_cents).toBe(120000);
    } finally {
      await adminClient.from('financial_charges').delete().eq('student_id', aluno.id);
      await adminClient.from('students').delete().eq('id', aluno.id);
    }
  }, 30000);
});
