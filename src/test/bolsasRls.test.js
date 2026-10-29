import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Gestão de bolsas (PLANO_EXPANSAO_GESTAO.md, item 13): só a Gestão lê renda e parecer;
// família só vê o que é dela; pedido, decisão e concessão só pelas funções; isolamento entre escolas.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario({ modulo = true } = {}) {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  if (modulo) await adminClient.from('schools').update({ features_enabled: { bolsas: true } }).eq('id', schoolA);
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const coordenacao = await createTestUser({ role: 'gestao_pedagogica', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const outraFamilia = await createTestUser({ role: 'family', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
  const { data: aluno, error: alunoErr } = await adminClient.from('students')
    .insert({ school_id: schoolA, name: 'Vitest Aluno', family_id: familia.id }).select('id').single();
  if (alunoErr) throw alunoErr;
  await adminClient.from('student_guardians').insert({ student_id: aluno.id, guardian_id: familia.id, is_financial: true, school_id: schoolA });
  const { data: tipo, error: tipoErr } = await adminClient.from('scholarship_types')
    .insert({ school_id: schoolA, nome: 'Bolsa social', percentual: 30, vagas: 1 }).select('id').single();
  if (tipoErr) throw tipoErr;

  const limpar = async () => {
    await adminClient.from('scholarship_grants').delete().eq('school_id', schoolA);
    await adminClient.from('scholarship_applications').delete().eq('school_id', schoolA);
    await adminClient.from('scholarship_types').delete().eq('school_id', schoolA);
    await adminClient.from('student_guardians').delete().eq('school_id', schoolA);
    await adminClient.from('students').delete().eq('school_id', schoolA);
    for (const u of [gestao, coordenacao, recepcao, familia, outraFamilia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, coordenacao, recepcao, familia, outraFamilia, gestaoB, aluno, tipo, limpar };
}

const pedir = (c, u = c.familia) => u.client.rpc('bolsas_enviar_pedido', {
  p_student: c.aluno.id, p_type: c.tipo.id, p_renda_cents: 250000, p_pessoas: 4, p_justificativa: 'Renda reduzida neste ano.',
});

runIf('Gestão de bolsas · RLS e regras', () => {
  it('família pede, só ela e a Gestão leem; Recepção, Coordenação e outra escola não', async () => {
    const c = await montaCenario();
    try {
      const { data: id, error } = await pedir(c);
      expect(error).toBeNull();
      expect(id).toBeTruthy();
      const { data: dela } = await c.familia.client.from('scholarship_applications').select('id, renda_mensal_cents');
      expect(dela).toHaveLength(1);
      const { data: g } = await c.gestao.client.from('scholarship_applications').select('id, renda_mensal_cents');
      expect(g).toHaveLength(1);
      for (const u of [c.outraFamilia, c.recepcao, c.coordenacao, c.gestaoB]) {
        const { data } = await u.client.from('scholarship_applications').select('id');
        expect(data || []).toHaveLength(0);
      }
    } finally { await c.limpar(); }
  });

  it('com o módulo desligado, ninguém usa nem a família pede', async () => {
    const c = await montaCenario({ modulo: false });
    try {
      const { error } = await pedir(c);
      expect(error).toBeTruthy();
      const { data } = await c.gestao.client.from('scholarship_types').select('id');
      expect(data || []).toHaveLength(0);
      const { data: f } = await c.familia.client.from('scholarship_types').select('id');
      expect(f || []).toHaveLength(0);
    } finally { await c.limpar(); }
  });

  it('só o responsável financeiro do aluno pede', async () => {
    const c = await montaCenario();
    try {
      const { error } = await pedir(c, c.outraFamilia);
      expect(error).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('ninguém escreve direto em pedido ou concessão', async () => {
    const c = await montaCenario();
    try {
      const { data: id } = await pedir(c);
      const grant = { school_id: c.schoolA, type_id: c.tipo.id, student_id: c.aluno.id, percentual: 30, inicio: '2026-11-01' };
      for (const u of [c.gestao, c.recepcao, c.familia]) {
        expect((await u.client.from('scholarship_applications').insert({ school_id: c.schoolA, type_id: c.tipo.id, student_id: c.aluno.id, family_id: c.familia.id, pessoas_na_casa: 2, justificativa: 'x' })).error).toBeTruthy();
        await u.client.from('scholarship_applications').update({ status: 'aprovada' }).eq('id', id);
        await u.client.from('scholarship_applications').delete().eq('id', id);
        expect((await u.client.from('scholarship_grants').insert(grant)).error).toBeTruthy();
      }
      const { data } = await adminClient.from('scholarship_applications').select('status').eq('id', id).single();
      expect(data.status).toBe('enviada');
    } finally { await c.limpar(); }
  });

  it('só a Gestão decide; aprovar cria a concessão e a família enxerga', async () => {
    const c = await montaCenario();
    try {
      const { data: id } = await pedir(c);
      for (const u of [c.coordenacao, c.recepcao, c.familia, c.gestaoB]) {
        const { error } = await u.client.rpc('bolsas_decidir_pedido', { p_application: id, p_aprovar: true, p_parecer: 'Aprovado' });
        expect(error).toBeTruthy();
      }
      const { error: semParecer } = await c.gestao.client.rpc('bolsas_decidir_pedido', { p_application: id, p_aprovar: true, p_parecer: '' });
      expect(semParecer).toBeTruthy();
      const { data: grantId, error } = await c.gestao.client.rpc('bolsas_decidir_pedido', { p_application: id, p_aprovar: true, p_parecer: 'Renda comprovada', p_inicio: '2026-11-01' });
      expect(error).toBeNull();
      expect(grantId).toBeTruthy();
      const { data: dela } = await c.familia.client.from('scholarship_grants').select('id, percentual');
      expect(dela).toHaveLength(1);
      expect(Number(dela[0].percentual)).toBe(30);
      const { data: outra } = await c.outraFamilia.client.from('scholarship_grants').select('id');
      expect(outra || []).toHaveLength(0);
      const { error: denovo } = await c.gestao.client.rpc('bolsas_decidir_pedido', { p_application: id, p_aprovar: false, p_parecer: 'Tarde' });
      expect(denovo).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('respeita as vagas do tipo', async () => {
    const c = await montaCenario();
    try {
      const { data: id } = await pedir(c);
      await c.gestao.client.rpc('bolsas_decidir_pedido', { p_application: id, p_aprovar: true, p_parecer: 'Aprovado', p_inicio: '2026-11-01' });
      const { data: aluno2 } = await adminClient.from('students').insert({ school_id: c.schoolA, name: 'Outro Aluno', family_id: c.outraFamilia.id }).select('id').single();
      await adminClient.from('student_guardians').insert({ student_id: aluno2.id, guardian_id: c.outraFamilia.id, is_financial: true, school_id: c.schoolA });
      const { data: id2, error } = await c.outraFamilia.client.rpc('bolsas_enviar_pedido', {
        p_student: aluno2.id, p_type: c.tipo.id, p_renda_cents: null, p_pessoas: 3, p_justificativa: 'Também preciso da bolsa.',
      });
      expect(error).toBeNull();
      const { error: semVaga } = await c.gestao.client.rpc('bolsas_decidir_pedido', { p_application: id2, p_aprovar: true, p_parecer: 'Aprovado', p_inicio: '2026-11-01' });
      expect(semVaga?.message).toMatch(/vagas/i);
    } finally { await c.limpar(); }
  });

  it('encerrar a concessão tira ela da vigência', async () => {
    const c = await montaCenario();
    try {
      const { data: id } = await pedir(c);
      const { data: grantId } = await c.gestao.client.rpc('bolsas_decidir_pedido', { p_application: id, p_aprovar: true, p_parecer: 'Aprovado', p_inicio: '2026-01-01' });
      const { error } = await c.gestao.client.rpc('bolsas_encerrar_concessao', { p_grant: grantId, p_motivo: 'Mudou de escola' });
      expect(error).toBeNull();
      const { data } = await adminClient.from('scholarship_grants').select('encerrada_em').eq('id', grantId).single();
      expect(data.encerrada_em).toBeTruthy();
    } finally { await c.limpar(); }
  });

  it('limite de desconto só pela Gestão e entre 1 e 100', async () => {
    const c = await montaCenario();
    try {
      expect((await c.coordenacao.client.rpc('bolsas_definir_limite', { p_percent: 50 })).error).toBeTruthy();
      expect((await c.gestao.client.rpc('bolsas_definir_limite', { p_percent: 150 })).error).toBeTruthy();
      expect((await c.gestao.client.rpc('bolsas_definir_limite', { p_percent: 60 })).error).toBeNull();
      const { data } = await adminClient.from('schools').select('scholarship_max_discount_percent').eq('id', c.schoolA).single();
      expect(Number(data.scholarship_max_discount_percent)).toBe(60);
    } finally { await c.limpar(); }
  });

  it('rotinas de expurgo não são chamáveis por usuário', async () => {
    const c = await montaCenario();
    try {
      expect((await c.gestao.client.rpc('bolsas_documentos_para_apagar')).error).toBeTruthy();
      expect((await c.gestao.client.rpc('bolsas_expurgar_pedidos', { p_applications: [] })).error).toBeTruthy();
    } finally { await c.limpar(); }
  });
});
