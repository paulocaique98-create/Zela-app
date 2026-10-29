import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Acordo de dívida (PLANO_EXPANSAO_GESTAO.md, item 10): cliente só lê; escrita só pelo servidor;
// isolamento entre escolas; transições válidas; quitação automática.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario() {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
  const { data: aluno, error: alunoErr } = await adminClient.from('students')
    .insert({ school_id: schoolA, name: 'Vitest Aluno', family_id: familia.id }).select('id').single();
  if (alunoErr) throw alunoErr;
  const { data: cobranca, error: cobErr } = await adminClient.from('financial_charges')
    .insert({ school_id: schoolA, student_id: aluno.id, family_id: familia.id, due_date: '2026-09-10', available_from: '2026-09-10', amount_cents: 10000, status: 'OVERDUE' })
    .select('id').single();
  if (cobErr) throw cobErr;
  const { data: acordo, error: acErr } = await adminClient.from('debt_agreements')
    .insert({ school_id: schoolA, guardian_id: familia.id, student_id: aluno.id, valor_original_cents: 10000, desconto_cents: 1000, valor_acordado_cents: 9000, parcelas: 1, primeiro_vencimento: '2026-12-10' })
    .select('id').single();
  if (acErr) throw acErr;
  const { error: vincErr } = await adminClient.from('debt_agreement_charges')
    .insert({ agreement_id: acordo.id, school_id: schoolA, charge_id: cobranca.id, amount_cents: 10000, status_anterior: 'OVERDUE' });
  if (vincErr) throw vincErr;

  const limpar = async () => {
    await adminClient.from('debt_agreements').delete().eq('school_id', schoolA);
    await adminClient.from('financial_charges').delete().eq('school_id', schoolA);
    await adminClient.from('students').delete().eq('school_id', schoolA);
    for (const u of [gestao, recepcao, familia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, recepcao, familia, gestaoB, aluno, cobranca, acordo, limpar };
}

runIf('Acordo de dívida · RLS e integridade', () => {
  it('Gestão lê; ninguém grava, edita ou apaga pelo cliente', async () => {
    const c = await montaCenario();
    try {
      const { data } = await c.gestao.client.from('debt_agreements').select('id').eq('id', c.acordo.id);
      expect(data).toHaveLength(1);
      const novo = { school_id: c.schoolA, guardian_id: c.familia.id, student_id: c.aluno.id, valor_original_cents: 5000, desconto_cents: 0, valor_acordado_cents: 5000, parcelas: 1, primeiro_vencimento: '2026-12-10' };
      for (const u of [c.gestao, c.recepcao, c.familia]) {
        const { error } = await u.client.from('debt_agreements').insert(novo);
        expect(error).toBeTruthy();
        await u.client.from('debt_agreements').update({ status: 'cancelado' }).eq('id', c.acordo.id);
        await u.client.from('debt_agreements').delete().eq('id', c.acordo.id);
      }
      const { data: depois } = await adminClient.from('debt_agreements').select('status').eq('id', c.acordo.id).single();
      expect(depois.status).toBe('aguardando_assinatura');
    } finally { await c.limpar(); }
  });

  it('outra escola e Recepção não enxergam; família só vê o próprio acordo', async () => {
    const c = await montaCenario();
    try {
      for (const tabela of ['debt_agreements', 'debt_agreement_charges', 'debt_agreement_installments']) {
        const { data: b } = await c.gestaoB.client.from(tabela).select('id');
        expect(b || []).toHaveLength(0);
        const { data: r } = await c.recepcao.client.from(tabela).select('id');
        expect(r || []).toHaveLength(0);
      }
      const { data: f } = await c.familia.client.from('debt_agreements').select('id');
      expect((f || []).length).toBeLessThanOrEqual(1);
    } finally { await c.limpar(); }
  });

  it('valores são imutáveis, transições inválidas são barradas e escola alheia é recusada', async () => {
    const c = await montaCenario();
    try {
      const { error: valor } = await adminClient.from('debt_agreements').update({ parcelas: 5 }).eq('id', c.acordo.id);
      expect(valor).toBeTruthy();
      const { error: pula } = await adminClient.from('debt_agreements').update({ status: 'quitado' }).eq('id', c.acordo.id);
      expect(pula).toBeTruthy();
      const { error: alheia } = await adminClient.from('debt_agreements')
        .insert({ school_id: c.schoolB, guardian_id: c.familia.id, student_id: c.aluno.id, valor_original_cents: 5000, desconto_cents: 0, valor_acordado_cents: 5000, parcelas: 1, primeiro_vencimento: '2026-12-10' });
      expect(alheia).toBeTruthy();
      const { error: soma } = await adminClient.from('debt_agreements')
        .insert({ school_id: c.schoolA, guardian_id: c.familia.id, student_id: c.aluno.id, valor_original_cents: 5000, desconto_cents: 100, valor_acordado_cents: 5000, parcelas: 1, primeiro_vencimento: '2026-12-10' });
      expect(soma).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('uma cobrança não entra em dois acordos vigentes', async () => {
    const c = await montaCenario();
    try {
      const { error } = await adminClient.from('debt_agreement_charges')
        .insert({ agreement_id: c.acordo.id, school_id: c.schoolA, charge_id: c.cobranca.id, amount_cents: 10000, status_anterior: 'OVERDUE' });
      expect(error).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('pagar a última parcela quita o acordo', async () => {
    const c = await montaCenario();
    try {
      await adminClient.from('debt_agreements').update({ status: 'ativo' }).eq('id', c.acordo.id);
      const { data: parcela } = await adminClient.from('financial_charges')
        .insert({ school_id: c.schoolA, student_id: c.aluno.id, family_id: c.familia.id, due_date: '2026-12-10', available_from: '2026-12-10', amount_cents: 9000, status: 'PENDING' })
        .select('id').single();
      await adminClient.from('debt_agreement_installments').insert({ agreement_id: c.acordo.id, school_id: c.schoolA, numero: 1, amount_cents: 9000, due_date: '2026-12-10', charge_id: parcela.id });
      await adminClient.from('financial_charges').update({ status: 'PAID' }).eq('id', parcela.id);
      const { data } = await adminClient.from('debt_agreements').select('status').eq('id', c.acordo.id).single();
      expect(data.status).toBe('quitado');
    } finally { await c.limpar(); }
  });
});
