import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Captação (PLANO_EXPANSAO_GESTAO.md, item 11): módulo desligado, RLS por escola e perfil,
// etapas, motivo da perda, fila com posição do banco e anonimização LGPD.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario({ modulo = true } = {}) {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  if (modulo) {
    await adminClient.from('schools').update({ features_enabled: { captacao: true } }).in('id', [schoolA, schoolB]);
  }
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const prof = await createTestUser({ role: 'teacher', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });

  const { data: lead } = await adminClient.from('leads')
    .insert({ school_id: schoolA, responsavel_nome: 'Vitest Lead', telefone: '11999990000', origem: 'site', consentimento_em: new Date().toISOString() })
    .select('id').single();

  const limpar = async () => {
    await adminClient.from('leads').delete().in('school_id', [schoolA, schoolB]);
    for (const u of [gestao, coord, recepcao, prof, familia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, coord, recepcao, prof, familia, gestaoB, lead, limpar };
}

runIf('Captação · RLS e regras', () => {
  it('só Gestão e Coordenação/Direção usam; Recepção, Professora e Família não; anon não insere', async () => {
    const c = await montaCenario();
    try {
      for (const u of [c.gestao, c.coord]) {
        const { data, error } = await u.client.from('leads').select('id');
        expect(error).toBeNull();
        expect(data.length).toBe(1);
      }
      for (const u of [c.recepcao, c.prof, c.familia]) {
        const { data } = await u.client.from('leads').select('id');
        expect(data).toEqual([]);
        const { error } = await u.client.from('leads').insert({ school_id: c.schoolA, responsavel_nome: 'Intruso', telefone: '1' });
        expect(error).not.toBeNull();
      }
    } finally { await c.limpar(); }
  });

  it('módulo desligado barra até a Gestão', async () => {
    const c = await montaCenario({ modulo: false });
    try {
      const { data } = await c.gestao.client.from('leads').select('id');
      expect(data).toEqual([]);
      const { error } = await c.gestao.client.from('leads').insert({ school_id: c.schoolA, responsavel_nome: 'X', telefone: '1' });
      expect(error).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('outra escola não vê nem altera o lead', async () => {
    const c = await montaCenario();
    try {
      const { data } = await c.gestaoB.client.from('leads').select('id').eq('id', c.lead.id);
      expect(data).toEqual([]);
      await c.gestaoB.client.from('leads').update({ etapa: 'contato' }).eq('id', c.lead.id);
      const { data: depois } = await adminClient.from('leads').select('etapa').eq('id', c.lead.id).single();
      expect(depois.etapa).toBe('novo');
      const { error } = await c.gestaoB.client.from('leads').insert({ school_id: c.schoolA, responsavel_nome: 'X', telefone: '1' });
      expect(error).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('perder exige motivo; sair de perdido limpa; identidade e consentimento não mudam', async () => {
    const c = await montaCenario();
    try {
      const { error: semMotivo } = await c.gestao.client.from('leads').update({ etapa: 'perdido' }).eq('id', c.lead.id);
      expect(semMotivo).not.toBeNull();
      const { error: ok } = await c.gestao.client.from('leads').update({ etapa: 'perdido', motivo_perda: 'Preço' }).eq('id', c.lead.id);
      expect(ok).toBeNull();
      let { data } = await adminClient.from('leads').select('perdido_em, motivo_perda').eq('id', c.lead.id).single();
      expect(data.perdido_em).not.toBeNull();
      await c.gestao.client.from('leads').update({ etapa: 'contato', consentimento_em: null }).eq('id', c.lead.id);
      ({ data } = await adminClient.from('leads').select('perdido_em, motivo_perda, consentimento_em, etapa').eq('id', c.lead.id).single());
      expect(data.etapa).toBe('contato');
      expect(data.perdido_em).toBeNull();
      expect(data.motivo_perda).toBeNull();
      expect(data.consentimento_em).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('lead sem telefone nem e-mail é barrado; responsável do lead tem que ser da equipe da escola', async () => {
    const c = await montaCenario();
    try {
      const { error: semContato } = await c.gestao.client.from('leads').insert({ school_id: c.schoolA, responsavel_nome: 'Sem contato' });
      expect(semContato).not.toBeNull();
      const { error: deFora } = await c.gestao.client.from('leads').update({ responsavel_id: c.gestaoB.id }).eq('id', c.lead.id);
      expect(deFora).not.toBeNull();
      const { error: daEquipe } = await c.gestao.client.from('leads').update({ responsavel_id: c.coord.id }).eq('id', c.lead.id);
      expect(daEquipe).toBeNull();
    } finally { await c.limpar(); }
  });

  it('visita agendada e realizada move a etapa; interação não muda nem apaga', async () => {
    const c = await montaCenario();
    try {
      const { data: v, error } = await c.gestao.client.from('lead_visits')
        .insert({ school_id: c.schoolA, lead_id: c.lead.id, agendada_para: new Date(Date.now() + 86400000).toISOString() })
        .select('id').single();
      expect(error).toBeNull();
      let { data } = await adminClient.from('leads').select('etapa').eq('id', c.lead.id).single();
      expect(data.etapa).toBe('visita_agendada');
      await c.gestao.client.from('lead_visits').update({ status: 'realizada' }).eq('id', v.id);
      ({ data } = await adminClient.from('leads').select('etapa').eq('id', c.lead.id).single());
      expect(data.etapa).toBe('visitou');

      const { data: i } = await c.gestao.client.from('lead_interactions')
        .insert({ school_id: c.schoolA, lead_id: c.lead.id, tipo: 'ligacao', nota: 'Ligou' }).select('id, registrado_por').single();
      expect(i.registrado_por).toBe(c.gestao.id);
      await c.gestao.client.from('lead_interactions').update({ nota: 'Alterada' }).eq('id', i.id);
      await c.gestao.client.from('lead_interactions').delete().eq('id', i.id);
      const { data: depois } = await adminClient.from('lead_interactions').select('nota').eq('id', i.id).single();
      expect(depois.nota).toBe('Ligou');
    } finally { await c.limpar(); }
  });

  it('fila: posição vem do banco, por turma, sem duplicar quem aguarda', async () => {
    const c = await montaCenario();
    try {
      const { data: l2 } = await adminClient.from('leads')
        .insert({ school_id: c.schoolA, responsavel_nome: 'Vitest Lead 2', telefone: '11999991111' }).select('id').single();
      const entrar = (lead, turma) => c.gestao.client.from('waitlist')
        .insert({ school_id: c.schoolA, lead_id: lead, turma, posicao: 99 }).select('posicao').single();
      const a = await entrar(c.lead.id, 'Infantil 2');
      const b = await entrar(l2.id, 'Infantil 2');
      const outra = await entrar(c.lead.id, 'Infantil 3');
      expect(a.data.posicao).toBe(1);
      expect(b.data.posicao).toBe(2);
      expect(outra.data.posicao).toBe(1);
      const dup = await entrar(c.lead.id, 'Infantil 2');
      expect(dup.error).not.toBeNull();
      const { error: muda } = await c.gestao.client.from('waitlist').update({ posicao: 5 }).eq('lead_id', c.lead.id).eq('turma', 'Infantil 2');
      expect(muda).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('só a Gestão apaga lead; Coordenação não', async () => {
    const c = await montaCenario();
    try {
      await c.coord.client.from('leads').delete().eq('id', c.lead.id);
      let { data } = await adminClient.from('leads').select('id').eq('id', c.lead.id);
      expect(data.length).toBe(1);
      await c.gestao.client.from('leads').delete().eq('id', c.lead.id);
      ({ data } = await adminClient.from('leads').select('id').eq('id', c.lead.id));
      expect(data.length).toBe(0);
    } finally { await c.limpar(); }
  });

  it('LGPD: perdido há mais de 12 meses é anonimizado; recente e matriculado ficam; usuário não executa', async () => {
    const c = await montaCenario();
    try {
      const velho = new Date(Date.now() - 400 * 86400000).toISOString();
      const { data: antigo } = await adminClient.from('leads')
        .insert({ school_id: c.schoolA, responsavel_nome: 'Vitest Antigo', telefone: '11988887777', email: 'a@b.com', crianca_nome: 'Criança',
          etapa: 'perdido', motivo_perda: 'Foi para outra escola', perdido_em: velho }).select('id').single();
      await adminClient.from('lead_interactions').insert({ school_id: c.schoolA, lead_id: antigo.id, tipo: 'nota', nota: 'Dado pessoal' });
      await adminClient.from('leads').update({ etapa: 'perdido', motivo_perda: 'Preço', perdido_em: new Date().toISOString() }).eq('id', c.lead.id);

      const { error: negado } = await c.gestao.client.rpc('leads_anonimizar_perdidos');
      expect(negado).not.toBeNull();

      const { data: n, error } = await adminClient.rpc('leads_anonimizar_perdidos');
      expect(error).toBeNull();
      expect(n).toBeGreaterThanOrEqual(1);
      const { data: a } = await adminClient.from('leads').select('responsavel_nome, telefone, email, crianca_nome, etapa, anonimizado_em').eq('id', antigo.id).single();
      expect(a.responsavel_nome).toBe('Anonimizado');
      expect(a.telefone).toBeNull();
      expect(a.email).toBeNull();
      expect(a.crianca_nome).toBeNull();
      expect(a.etapa).toBe('perdido');
      expect(a.anonimizado_em).not.toBeNull();
      const { data: nota } = await adminClient.from('lead_interactions').select('nota').eq('lead_id', antigo.id).single();
      expect(nota.nota).not.toContain('Dado pessoal');
      const { data: novo } = await adminClient.from('leads').select('responsavel_nome, anonimizado_em').eq('id', c.lead.id).single();
      expect(novo.responsavel_nome).toBe('Vitest Lead');
      expect(novo.anonimizado_em).toBeNull();

      const { error: editar } = await c.gestao.client.from('leads').update({ interesse: 'x' }).eq('id', antigo.id);
      expect(editar).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('funil agrega por origem e etapa, só da própria escola', async () => {
    const c = await montaCenario();
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data, error } = await c.gestao.client.rpc('captacao_funil', { p_inicio: hoje, p_fim: hoje });
      expect(error).toBeNull();
      expect(data).toEqual([{ origem: 'site', etapa: 'novo', total: 1 }]);
      const { data: vazio } = await c.gestaoB.client.rpc('captacao_funil', { p_inicio: hoje, p_fim: hoje });
      expect(vazio).toEqual([]);
    } finally { await c.limpar(); }
  });
});
