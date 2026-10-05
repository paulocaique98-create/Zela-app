import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Planos do Zela (menu Planos do Portal do Dev): catálogo só do developer,
// contratação só pela RPC, isolamento entre escolas. Roda contra o Supabase
// LOCAL (Docker).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Planos do Zela (RLS e RPC)', () => {
  const c = {};
  const contratar = (client, extra = {}) => client.rpc('contratar_plano_escola', {
    p_school_id: c.escolaA, p_plano_id: c.pacote, p_ciclo: 'ANUAL', p_alunos: 80, ...extra,
  });

  beforeAll(async () => {
    c.escolaA = await createTestSchool();
    c.escolaB = await createTestSchool();
    c.dev = await createTestUser({ role: 'developer', schoolId: null });
    c.admin = await createTestUser({ role: 'admin', schoolId: c.escolaA });
    c.gestao = await createTestUser({ role: 'gestao', schoolId: c.escolaA });
    c.gestaoB = await createTestUser({ role: 'gestao', schoolId: c.escolaB });
    c.teacher = await createTestUser({ role: 'teacher', schoolId: c.escolaA, extra: { teacher_status: 'ativo' } });
    c.family = await createTestUser({ role: 'family', schoolId: c.escolaA, extra: { doc_number: '11122233344' } });
    c.financeiro = await createTestUser({ role: 'financeiro', schoolId: c.escolaA });

    const { data: planos, error } = await adminClient.from('zela_planos').select('id, nome, modalidade').in('nome', ['Completo', 'Por aluno']);
    if (error) throw error;
    c.pacote = planos.find(p => p.nome === 'Completo').id;
    c.porAluno = planos.find(p => p.nome === 'Por aluno').id;

    // 51 alunos ativos na escola B (para recusar a modalidade por aluno).
    const alunos = Array.from({ length: 51 }, (_, i) => ({ school_id: c.escolaB, name: `Vitest Plano ${i}`, turma: 'Nido', birth_date: '2024-01-05' }));
    const { error: e2 } = await adminClient.from('students').insert(alunos);
    if (e2) throw e2;
  }, 120000);

  afterAll(async () => {
    for (const s of [c.escolaA, c.escolaB]) {
      if (!s) continue;
      await adminClient.from('school_contratacoes').delete().eq('school_id', s);
      await adminClient.from('school_feature_changes').delete().eq('school_id', s);
      await adminClient.from('students').delete().eq('school_id', s);
    }
    for (const u of [c.dev, c.admin, c.gestao, c.gestaoB, c.teacher, c.family, c.financeiro]) {
      if (u?.id) await deleteTestUser(u.id);
    }
    for (const s of [c.escolaA, c.escolaB]) if (s) await deleteTestSchool(s);
  }, 120000);

  describe('Catálogo', () => {
    it('developer lê planos, preços, ciclos e configuração', async () => {
      for (const t of ['zela_planos', 'zela_modulo_precos', 'zela_plano_ciclos', 'zela_config_comercial']) {
        const { data, error } = await c.dev.client.from(t).select('*').limit(1);
        expect(error).toBeNull();
        expect(data.length).toBe(1);
      }
    });

    it.each(['admin', 'gestao', 'teacher', 'family', 'financeiro'])('%s não lê nem escreve o catálogo', async (papel) => {
      for (const t of ['zela_planos', 'zela_modulo_precos', 'zela_plano_ciclos', 'zela_config_comercial', 'zela_planos_historico', 'school_contratacoes']) {
        const { data } = await c[papel].client.from(t).select('*').limit(1);
        expect(data || []).toEqual([]);
      }
      await c[papel].client.from('zela_modulo_precos').update({ valor: 0.01 }).eq('item_id', 'base');
      const { data } = await adminClient.from('zela_modulo_precos').select('valor').eq('item_id', 'base').single();
      expect(Number(data.valor)).not.toBe(0.01);
      const ins = await c[papel].client.from('zela_planos').insert({ nome: 'Invasor', modalidade: 'pacote', implantacao_valor: 800 });
      expect(ins.error).not.toBeNull();
    });

    it('ninguém apaga plano nem preço (nem o developer)', async () => {
      await c.dev.client.from('zela_planos').delete().eq('id', c.pacote);
      await c.dev.client.from('zela_modulo_precos').delete().eq('item_id', 'base');
      const { data } = await adminClient.from('zela_planos').select('id').eq('id', c.pacote);
      expect(data).toHaveLength(1);
    });

    it('implantação fora da faixa, item técnico e item repetido são recusados', async () => {
      const base = { nome: 'Teste faixa', modalidade: 'pacote', itens: [] };
      expect((await c.dev.client.from('zela_planos').insert({ ...base, implantacao_valor: 100 })).error).not.toBeNull();
      expect((await c.dev.client.from('zela_planos').insert({ ...base, implantacao_valor: 5000 })).error).not.toBeNull();
      expect((await c.dev.client.from('zela_planos').insert({ ...base, nome: 'Teste tec', implantacao_valor: 800, itens: ['liveness_bloqueio'] })).error).not.toBeNull();
      expect((await c.dev.client.from('zela_planos').insert({ ...base, nome: 'Teste rep', implantacao_valor: 800, itens: ['chat', 'chat'] })).error).not.toBeNull();
    });

    it('mudança de preço grava o histórico', async () => {
      await c.dev.client.from('zela_modulo_precos').update({ custo_estimado: 0.33 }).eq('item_id', 'qr');
      const { data } = await c.dev.client.from('zela_planos_historico').select('depois').eq('tabela', 'zela_modulo_precos').eq('registro_id', 'qr');
      expect(data.some(h => Number(h.depois.custo_estimado) === 0.33)).toBe(true);
      await c.dev.client.from('zela_modulo_precos').update({ custo_estimado: 0.05 }).eq('item_id', 'qr');
    });
  });

  describe('Contratação (RPC)', () => {
    it('recusa quem não é developer', async () => {
      for (const papel of ['admin', 'gestao', 'teacher', 'family', 'financeiro']) {
        const { error } = await contratar(c[papel].client);
        expect(error).not.toBeNull();
      }
      const { data } = await adminClient.from('school_contratacoes').select('id').eq('school_id', c.escolaA);
      expect(data).toEqual([]);
    });

    it('não permite gravar contratação direto na tabela', async () => {
      const { error } = await c.dev.client.from('school_contratacoes').insert({ school_id: c.escolaA, plano_id: c.pacote, ciclo: 'ANUAL', meses: 12, alunos_contratados: 1, snapshot: {}, valor_mensal: 0, valor_ciclo: 0, implantacao_base: 0, implantacao_final: 0, inicio: '2026-10-05', fim: '2027-10-05' });
      expect(error).not.toBeNull();
    });

    it('recusa por aluno com 51 alunos ativos e aceita o pacote', async () => {
      const recusa = await c.dev.client.rpc('contratar_plano_escola', { p_school_id: c.escolaB, p_plano_id: c.porAluno, p_ciclo: 'MENSAL', p_alunos: 40, p_itens: [] });
      expect(recusa.error).not.toBeNull();
      const ok = await c.dev.client.rpc('contratar_plano_escola', { p_school_id: c.escolaB, p_plano_id: c.pacote, p_ciclo: 'MENSAL', p_alunos: 51 });
      expect(ok.error).toBeNull();
    });

    it('calcula no servidor, liga os módulos do plano e não mexe em outra escola', async () => {
      const antesB = await adminClient.from('schools').select('features_enabled').eq('id', c.escolaB).single();
      const { data: id, error } = await contratar(c.dev.client, { p_desconto_tipo: 'percent', p_desconto: 50, p_motivo: 'Parceria' });
      expect(error).toBeNull();
      const { data: ct } = await adminClient.from('school_contratacoes').select('*').eq('id', id).single();
      // Completo: 80 x 11,90 = 952 (acima do mínimo 790); anual com 10%: 952 x 12 x 0,9.
      expect(Number(ct.valor_mensal)).toBe(952);
      expect(Number(ct.valor_ciclo)).toBe(10281.6);
      expect(Number(ct.implantacao_base)).toBe(900);
      expect(Number(ct.implantacao_final)).toBe(450);
      expect(ct.status).toBe('ativa');
      const { data: s } = await adminClient.from('schools').select('features_enabled').eq('id', c.escolaA).single();
      expect(s.features_enabled.relatorios_pedagogicos).toBe(true);
      expect(s.features_enabled.diario).toBe(true);
      expect(s.features_enabled.chat).toBe(false);
      const depoisB = await adminClient.from('schools').select('features_enabled').eq('id', c.escolaB).single();
      expect(depoisB.data.features_enabled).toEqual(antesB.data.features_enabled);
    });

    it('usa o mínimo mensal quando os alunos não chegam nele', async () => {
      const { data: id, error } = await contratar(c.dev.client, { p_alunos: 20 });
      expect(error).toBeNull();
      const { data: ct } = await adminClient.from('school_contratacoes').select('valor_mensal').eq('id', id).single();
      expect(Number(ct.valor_mensal)).toBe(790);
    });

    it('recusa desconto sem motivo e acima do teto', async () => {
      expect((await contratar(c.dev.client, { p_desconto_tipo: 'percent', p_desconto: 10 })).error).not.toBeNull();
      expect((await contratar(c.dev.client, { p_desconto_tipo: 'percent', p_desconto: 80, p_motivo: 'Teste' })).error).not.toBeNull();
      expect((await contratar(c.dev.client, { p_desconto_tipo: 'valor', p_desconto: 800, p_motivo: 'Teste' })).error).not.toBeNull();
    });

    it('mantém uma única contratação ativa por escola', async () => {
      const { data } = await adminClient.from('school_contratacoes').select('id, status').eq('school_id', c.escolaA);
      expect(data.filter(x => x.status === 'ativa')).toHaveLength(1);
      expect(data.length).toBeGreaterThan(1);
    });
  });

  describe('Meu plano', () => {
    it('a Gestão vê só a própria contratação, sem custo nem motivo', async () => {
      const { data, error } = await c.gestao.client.rpc('meu_plano_escola');
      expect(error).toBeNull();
      expect(data.plano).toBe('Completo');
      expect(data).not.toHaveProperty('desconto_motivo');
      expect(data).not.toHaveProperty('snapshot');
      expect(JSON.stringify(data)).not.toMatch(/custo/);
    });

    it('a Gestão de outra escola vê a dela, não a da escola A', async () => {
      const { data } = await c.gestaoB.client.rpc('meu_plano_escola');
      expect(data.alunos_contratados).toBe(51);
    });

    it('outros perfis não recebem nada', async () => {
      for (const papel of ['admin', 'teacher', 'family', 'financeiro']) {
        const { data } = await c[papel].client.rpc('meu_plano_escola');
        expect(data).toBeNull();
      }
    });

    it('contagem de alunos por escola é só do developer', async () => {
      expect((await c.dev.client.rpc('contagem_alunos_escolas')).error).toBeNull();
      expect((await c.gestao.client.rpc('contagem_alunos_escolas')).error).not.toBeNull();
    });
  });
});
