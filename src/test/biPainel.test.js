import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Painel de indicadores (PLANO_EXPANSAO_GESTAO.md, Fase 1.2): RPCs bi_*.
// Gestão lê tudo; Coordenação (gestao_pedagogica) não recebe R$; Recepção, Família e
// anônimo são barrados; outra escola enxerga zero; período máximo de 24 meses.
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
    .insert({ school_id: schoolA, name: 'Vitest Aluno BI', turma: 'Nido', family_id: familia.id }).select('id').single();
  if (alunoErr) throw alunoErr;

  const cobranca = (due_date, amount_cents, status, extra = {}) => ({
    school_id: schoolA, student_id: aluno.id, family_id: familia.id, due_date, available_from: due_date, amount_cents, status, ...extra,
  });
  const { error: cobErr } = await adminClient.from('financial_charges').insert([
    cobranca('2026-09-10', 10000, 'PAID', { payment_method: 'pix', paid_at: '2026-09-10T12:00:00Z' }),
    cobranca('2026-09-20', 5000, 'PENDING'),
    cobranca('2026-09-25', 7000, 'CANCELLED'),
  ]);
  if (cobErr) throw cobErr;

  const limpar = async () => {
    await adminClient.from('financial_charges').delete().eq('school_id', schoolA);
    await adminClient.from('students').delete().eq('school_id', schoolA);
    for (const u of [gestao, coord, recepcao, familia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, gestao, coord, recepcao, familia, gestaoB, limpar };
}

runIf('Painel de indicadores · RPCs bi_*', () => {
  it('Gestão enxerga os números da própria escola; cancelada fica fora do previsto', async () => {
    const c = await montaCenario();
    try {
      const { data: geral, error } = await c.gestao.client.rpc('bi_visao_geral', { p_inicio: INICIO, p_fim: FIM });
      expect(error).toBeNull();
      expect(geral.valores_visiveis).toBe(true);
      expect(geral.kpis.alunos_ativos).toBe(1);
      expect(geral.kpis.previsto_cents).toBe(15000);
      expect(geral.kpis.recebido_cents).toBe(10000);
      expect(geral.kpis.atraso_cents).toBe(5000);

      const { data: fin, error: finErr } = await c.gestao.client.rpc('bi_financeiro', { p_inicio: INICIO, p_fim: FIM });
      expect(finErr).toBeNull();
      expect(fin.kpis.taxa_recebimento_pct).toBe(66.7);
      expect(fin.envelhecimento).toHaveLength(5);
      expect(fin.formas_pagamento[0].forma).toBe('pix');
      expect(fin.maiores_atrasos[0].valor_cents).toBe(5000);

      const { data: det, error: detErr } = await c.gestao.client.rpc('bi_detalhe', {
        p_indicador: 'financeiro_atraso', p_inicio: INICIO, p_fim: FIM, p_filtros: { turmas: ['Nido'] },
      });
      expect(detErr).toBeNull();
      expect(det.total).toBe(1);
      expect(det.linhas[0].amount_cents).toBe(5000);

      const { data: outraTurma } = await c.gestao.client.rpc('bi_visao_geral', { p_inicio: INICIO, p_fim: FIM, p_turmas: ['Outra'] });
      expect(outraTurma.kpis.alunos_ativos).toBe(0);
      expect(outraTurma.kpis.previsto_cents).toBe(0);
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('Coordenação vê a visão geral sem R$ e é barrada no financeiro', async () => {
    const c = await montaCenario();
    try {
      const { data: geral, error } = await c.coord.client.rpc('bi_visao_geral', { p_inicio: INICIO, p_fim: FIM });
      expect(error).toBeNull();
      expect(geral.valores_visiveis).toBe(false);
      expect(geral.kpis.alunos_ativos).toBe(1);
      expect(geral.kpis.previsto_cents).toBeNull();
      expect(geral.kpis.recebido_cents).toBeNull();
      expect(geral.kpis.atraso_cents).toBeNull();
      expect(JSON.stringify(geral.serie_mensal)).not.toMatch(/"(previsto|recebido)_cents":\s*\d/);

      const { error: finErr } = await c.coord.client.rpc('bi_financeiro', { p_inicio: INICIO, p_fim: FIM });
      expect(finErr?.code).toBe(NEGADO);
      const { error: detErr } = await c.coord.client.rpc('bi_detalhe', { p_indicador: 'financeiro_recebido', p_inicio: INICIO, p_fim: FIM });
      expect(detErr?.code).toBe(NEGADO);

      const { data: alunos, error: alunosErr } = await c.coord.client.rpc('bi_detalhe', { p_indicador: 'alunos_ativos', p_inicio: INICIO, p_fim: FIM });
      expect(alunosErr).toBeNull();
      expect(alunos.total).toBe(1);
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('Recepção, Família e anônimo são barrados', async () => {
    const c = await montaCenario();
    try {
      for (const u of [c.recepcao, c.familia]) {
        const { error } = await u.client.rpc('bi_visao_geral', { p_inicio: INICIO, p_fim: FIM });
        expect(error?.code).toBe(NEGADO);
        const { error: finErr } = await u.client.rpc('bi_financeiro', { p_inicio: INICIO, p_fim: FIM });
        expect(finErr?.code).toBe(NEGADO);
      }
      const anon = createClient(SUPABASE_URL, ANON_KEY);
      const { error: anonErr } = await anon.rpc('bi_visao_geral', { p_inicio: INICIO, p_fim: FIM });
      expect(anonErr).not.toBeNull();
    } finally {
      await c.limpar();
    }
  }, 60000);

  it('Gestão de outra escola recebe zeros e período inválido ou acima de 24 meses dá erro', async () => {
    const c = await montaCenario();
    try {
      const { data: geral } = await c.gestaoB.client.rpc('bi_visao_geral', { p_inicio: INICIO, p_fim: FIM });
      expect(geral.kpis.alunos_ativos).toBe(0);
      expect(geral.kpis.previsto_cents).toBe(0);
      const { data: det } = await c.gestaoB.client.rpc('bi_detalhe', { p_indicador: 'financeiro_previsto', p_inicio: INICIO, p_fim: FIM });
      expect(det.total).toBe(0);
      expect(det.linhas).toEqual([]);

      const { error: longo } = await c.gestao.client.rpc('bi_visao_geral', { p_inicio: '2024-01-01', p_fim: '2026-09-30' });
      expect(longo?.message).toMatch(/bi_periodo_maximo_24_meses/);
      const { error: invertido } = await c.gestao.client.rpc('bi_visao_geral', { p_inicio: FIM, p_fim: INICIO });
      expect(invertido?.message).toMatch(/bi_periodo_invalido/);
      const { error: desconhecido } = await c.gestao.client.rpc('bi_detalhe', { p_indicador: 'inexistente', p_inicio: INICIO, p_fim: FIM });
      expect(desconhecido?.message).toMatch(/bi_indicador_invalido/);
    } finally {
      await c.limpar();
    }
  }, 60000);
});
