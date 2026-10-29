import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Conciliação bancária (PLANO_EXPANSAO_GESTAO.md, item 9): só a Gestão da própria escola
// lê e grava; FITID repetido não duplica; referências de outra escola são barradas.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario() {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });

  const { data: conta, error: contaErr } = await gestao.client.from('school_bank_accounts')
    .insert({ school_id: schoolA, apelido: 'Vitest Conta' }).select('id').single();
  if (contaErr) throw contaErr;
  const { data: imp, error: impErr } = await gestao.client.from('bank_statement_imports')
    .insert({ school_id: schoolA, account_id: conta.id, arquivo_nome: 'x.ofx', linhas_total: 1, linhas_novas: 1 }).select('id').single();
  if (impErr) throw impErr;

  const linha = (fitid, extra = {}) => ({ school_id: schoolA, import_id: imp.id, account_id: conta.id, fitid, data: '2026-09-10', valor_cents: -5000, descricao: 'Vitest', ...extra });

  const limpar = async () => {
    await adminClient.from('bank_statement_lines').delete().eq('school_id', schoolA);
    await adminClient.from('bank_statement_imports').delete().eq('school_id', schoolA);
    await adminClient.from('school_bank_accounts').delete().eq('school_id', schoolA);
    await adminClient.from('expenses').delete().in('school_id', [schoolA, schoolB]);
    for (const u of [gestao, recepcao, familia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, recepcao, familia, gestaoB, conta, imp, linha, limpar };
}

runIf('Conciliação bancária · RLS e integridade', () => {
  it('Gestão grava linhas; o mesmo FITID da mesma conta não duplica', async () => {
    const c = await montaCenario();
    try {
      const { error } = await c.gestao.client.from('bank_statement_lines').insert(c.linha('F1'));
      expect(error).toBeNull();
      const { error: dup } = await c.gestao.client.from('bank_statement_lines').insert(c.linha('F1'));
      expect(dup?.code).toBe('23505');
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('Recepção e Família não leem nem gravam contas, importações ou linhas', async () => {
    const c = await montaCenario();
    try {
      await c.gestao.client.from('bank_statement_lines').insert(c.linha('F2'));
      for (const u of [c.recepcao, c.familia]) {
        for (const tabela of ['school_bank_accounts', 'bank_statement_imports', 'bank_statement_lines']) {
          const { data } = await u.client.from(tabela).select('id').eq('school_id', c.schoolA);
          expect(data ?? []).toEqual([]);
        }
        const { error } = await u.client.from('bank_statement_lines').insert(c.linha('F3'));
        expect(error).not.toBeNull();
      }
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('Gestão de outra escola não lê nem grava na escola A', async () => {
    const c = await montaCenario();
    try {
      await c.gestao.client.from('bank_statement_lines').insert(c.linha('F4'));
      const { data } = await c.gestaoB.client.from('bank_statement_lines').select('id').eq('school_id', c.schoolA);
      expect(data ?? []).toEqual([]);
      const { error } = await c.gestaoB.client.from('bank_statement_lines').insert(c.linha('F5'));
      expect(error).not.toBeNull();
      const { data: contas } = await c.gestaoB.client.from('school_bank_accounts').select('id').eq('school_id', c.schoolA);
      expect(contas ?? []).toEqual([]);
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('linha da escola B não aceita conta nem despesa da escola A', async () => {
    const c = await montaCenario();
    try {
      const { data: despA } = await adminClient.from('expenses')
        .insert({ school_id: c.schoolA, description: 'Vitest A', category: 'Outros', amount_cents: 5000, due_date: '2026-09-10' }).select('id').single();
      const { error: contaAlheia } = await c.gestaoB.client.from('bank_statement_lines')
        .insert({ ...c.linha('F6'), school_id: c.schoolB });
      expect(contaAlheia).not.toBeNull();
      // Mesma escola, mas despesa de outra: o gatilho barra.
      const { data: contaB } = await c.gestaoB.client.from('school_bank_accounts').insert({ school_id: c.schoolB, apelido: 'Vitest B' }).select('id').single();
      const { data: impB } = await c.gestaoB.client.from('bank_statement_imports').insert({ school_id: c.schoolB, account_id: contaB.id }).select('id').single();
      const { error: despAlheia } = await c.gestaoB.client.from('bank_statement_lines')
        .insert({ school_id: c.schoolB, import_id: impB.id, account_id: contaB.id, fitid: 'F7', data: '2026-09-10', valor_cents: -5000, expense_id: despA.id, status: 'conciliada' });
      expect(despAlheia).not.toBeNull();
      await adminClient.from('bank_statement_lines').delete().eq('school_id', c.schoolB);
      await adminClient.from('bank_statement_imports').delete().eq('school_id', c.schoolB);
      await adminClient.from('school_bank_accounts').delete().eq('school_id', c.schoolB);
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('linha não vincula cobrança a saída nem despesa a entrada; histórico não se apaga', async () => {
    const c = await montaCenario();
    try {
      const { error: sinal } = await c.gestao.client.from('bank_statement_lines')
        .insert(c.linha('F8', { valor_cents: 5000, expense_id: '00000000-0000-0000-0000-000000000000' }));
      expect(sinal).not.toBeNull();
      const { data: ok } = await c.gestao.client.from('bank_statement_lines').insert(c.linha('F9')).select('id').single();
      await c.gestao.client.from('bank_statement_lines').delete().eq('id', ok.id);
      const { data: depois } = await c.gestao.client.from('bank_statement_lines').select('id').eq('id', ok.id);
      expect(depois).toHaveLength(1);
    } finally {
      await c.limpar();
    }
  }, 60000);
});
