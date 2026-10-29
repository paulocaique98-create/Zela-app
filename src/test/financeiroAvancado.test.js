import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// DRE e fluxo de caixa (PLANO_EXPANSAO_GESTAO.md, item 3): fin_dre e fin_fluxo_projetado.
// Só Gestão lê; Coordenação, Recepção e Família são barradas; outra escola enxerga zero.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

const INICIO = '2026-09-01';
const FIM = '2026-09-30';
const NEGADO = '42501';

async function montaCenario() {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });

  const { data: aluno, error: alunoErr } = await adminClient.from('students')
    .insert({ school_id: schoolA, name: 'Vitest Aluno DRE', turma: 'Nido', family_id: familia.id }).select('id').single();
  if (alunoErr) throw alunoErr;

  const cobranca = (due_date, amount_cents, status, extra = {}) => ({
    school_id: schoolA, student_id: aluno.id, family_id: familia.id, due_date, available_from: due_date, amount_cents, status, ...extra,
  });
  const { error: cobErr } = await adminClient.from('financial_charges').insert([
    cobranca('2026-09-10', 10000, 'PAID', { payment_method: 'pix', paid_at: '2026-10-02T12:00:00Z' }),
    cobranca('2026-09-20', 5000, 'PENDING'),
    cobranca('2026-09-25', 7000, 'CANCELLED'),
  ]);
  if (cobErr) throw cobErr;

  const despesa = (category, amount_cents, due_date, paid_on) => ({
    school_id: schoolA, description: `Vitest ${category}`, category, amount_cents, due_date,
    status: paid_on ? 'pago' : 'pendente', paid_on: paid_on || null,
  });
  const { error: despErr } = await adminClient.from('expenses').insert([
    despesa('Folha de pagamento', 4000, '2026-09-05', '2026-09-05'),
    despesa('Aluguel', 1500, '2026-09-08', null),
  ]);
  if (despErr) throw despErr;

  const limpar = async () => {
    await adminClient.from('financial_charges').delete().eq('school_id', schoolA);
    await adminClient.from('expenses').delete().eq('school_id', schoolA);
    await adminClient.from('school_cash_balances').delete().eq('school_id', schoolA);
    await adminClient.from('expense_categories').delete().eq('school_id', schoolA);
    await adminClient.from('students').delete().eq('school_id', schoolA);
    for (const u of [gestao, coord, recepcao, familia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, gestao, coord, recepcao, familia, gestaoB, limpar };
}

runIf('Financeiro avançado · fin_dre e fin_fluxo_projetado', () => {
  it('regime competência soma cobranças do vencimento (sem cancelada) e despesas não canceladas', async () => {
    const c = await montaCenario();
    try {
      const { data, error } = await c.gestao.client.rpc('fin_dre', { p_inicio: INICIO, p_fim: FIM, p_regime: 'competencia' });
      expect(error).toBeNull();
      expect(data.receita_total).toBe(15000);
      expect(data.despesa_total).toBe(5500);
      expect(data.receita_por_mes['2026-09']).toBe(15000);
      // Sem linha em expense_categories, a despesa cai em "outros".
      expect(data.despesa_por_grupo_mes.every(l => l.grupo === 'outros')).toBe(true);
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('regime caixa usa paid_at e paid_on: pagamento de outubro fica fora de setembro', async () => {
    const c = await montaCenario();
    try {
      await c.gestao.client.from('expense_categories').insert({ school_id: c.schoolA, nome: 'Folha de pagamento', grupo_dre: 'pessoal' });
      const { data, error } = await c.gestao.client.rpc('fin_dre', { p_inicio: INICIO, p_fim: FIM, p_regime: 'caixa' });
      expect(error).toBeNull();
      expect(data.receita_total).toBe(0);
      expect(data.despesa_total).toBe(4000);
      expect(data.despesa_por_grupo_mes[0].grupo).toBe('pessoal');
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('fluxo projetado devolve o saldo informado e semanas com entradas e saídas', async () => {
    const c = await montaCenario();
    try {
      await c.gestao.client.from('school_cash_balances').insert({ school_id: c.schoolA, data: '2026-01-01', saldo_cents: 20000 });
      const { data, error } = await c.gestao.client.rpc('fin_fluxo_projetado', { p_dias: 30 });
      expect(error).toBeNull();
      expect(data.saldo_inicial_cents).toBe(20000);
      expect(data.semanas.length).toBeGreaterThanOrEqual(4);
      const { error: invalido } = await c.gestao.client.rpc('fin_fluxo_projetado', { p_dias: 45 });
      expect(invalido).not.toBeNull();
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('Coordenação, Recepção e Família são barradas; outra escola enxerga zero', async () => {
    const c = await montaCenario();
    try {
      for (const u of [c.coord, c.recepcao, c.familia]) {
        const { error } = await u.client.rpc('fin_dre', { p_inicio: INICIO, p_fim: FIM });
        expect(error?.code).toBe(NEGADO);
        const { error: e2 } = await u.client.rpc('fin_fluxo_projetado', { p_dias: 30 });
        expect(e2?.code).toBe(NEGADO);
      }
      const { data } = await c.gestaoB.client.rpc('fin_dre', { p_inicio: INICIO, p_fim: FIM, p_regime: 'competencia' });
      expect(data.receita_total).toBe(0);
      expect(data.despesa_total).toBe(0);

      const { data: cats } = await c.gestaoB.client.from('expense_categories').select('id').eq('school_id', c.schoolA);
      expect(cats).toEqual([]);
      const { error: periodo } = await c.gestao.client.rpc('fin_dre', { p_inicio: INICIO, p_fim: '2029-01-01' });
      expect(periodo).not.toBeNull();
    } finally {
      await c.limpar();
    }
  }, 60000);
});
