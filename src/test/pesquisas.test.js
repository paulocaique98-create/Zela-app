import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Avaliação institucional (PLANO_EXPANSAO_GESTAO.md, item 8), migration
// 20261117120000_avaliacao_institucional: módulo desligado, resposta anônima não liga ao
// usuário, ninguém responde duas vezes, público certo, segmento só com 5 respostas,
// pesquisa publicada não se edita, outra escola não vê nada.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Pesquisas (RLS e RPCs)', () => {
  let escolaA, escolaB, gestao, coord, recepcao, gestaoB, prof, profInativa, familia, familiaKids, outraFamilia, familiaB;
  const familiasExtras = [];
  const dados = (extra = {}) => ({
    titulo: 'Vitest pesquisa', descricao: '', publico: 'familias', anonima: false,
    abre_em: new Date(Date.now() - 60_000).toISOString(),
    fecha_em: new Date(Date.now() + 86_400_000).toISOString(), ...extra,
  });
  const perguntas = [
    { tipo: 'nps', enunciado: 'Recomendaria a escola?', obrigatoria: true },
    { tipo: 'multipla', enunciado: 'Qual canal prefere?', opcoes: ['App', 'Bilhete'], obrigatoria: true },
    { tipo: 'texto', enunciado: 'Algum comentário?', obrigatoria: false },
  ];

  const criar = async (u, extra = {}, p = perguntas) => {
    const { data, error } = await u.client.rpc('pesquisa_salvar', { p_id: null, p_dados: dados(extra), p_perguntas: p });
    if (error) throw new Error(error.message);
    return data;
  };
  const publicar = async (u, id) => (await u.client.rpc('pesquisa_publicar', { p_id: id })).error;
  const responderPergunta = async (u, id, nota = 9, canal = 'App', texto = 'ok') => {
    const ps = (await adminClient.from('survey_questions').select('id, tipo').eq('survey_id', id).order('ordem')).data;
    const v = { nps: String(nota), multipla: canal, texto };
    return u.client.rpc('pesquisa_responder', {
      p_id: id, p_respostas: ps.map(q => ({ question_id: q.id, valor: v[q.tipo] })),
    });
  };

  beforeAll(async () => {
    escolaA = await createTestSchool('Vitest Pesquisas A');
    escolaB = await createTestSchool('Vitest Pesquisas B');
    await adminClient.from('schools').update({ features_enabled: { avaliacao_institucional: true } }).in('id', [escolaA, escolaB]);
    gestao = await createTestUser({ role: 'gestao', schoolId: escolaA });
    coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: escolaA });
    recepcao = await createTestUser({ role: 'admin', schoolId: escolaA });
    gestaoB = await createTestUser({ role: 'gestao', schoolId: escolaB });
    prof = await createTestUser({ role: 'teacher', schoolId: escolaA, extra: { teacher_status: 'ativo', turmas: ['Nido'] } });
    profInativa = await createTestUser({ role: 'teacher', schoolId: escolaA, extra: { teacher_status: 'inativo', turmas: ['Nido'] } });
    familia = await createTestUser({ role: 'family', schoolId: escolaA });
    familiaKids = await createTestUser({ role: 'family', schoolId: escolaA });
    outraFamilia = await createTestUser({ role: 'family', schoolId: escolaA });
    familiaB = await createTestUser({ role: 'family', schoolId: escolaB });
    const aluno = (turma, familyId) => adminClient.from('students')
      .insert({ school_id: escolaA, name: `Vitest Aluno ${turma}`, turma, family_id: familyId });
    await aluno('Nido', familia.id);
    await aluno('Kids', familiaKids.id);
    await aluno('Nido', outraFamilia.id);
  });

  afterAll(async () => {
    await adminClient.from('surveys').delete().in('school_id', [escolaA, escolaB]);
    await adminClient.from('students').delete().eq('school_id', escolaA);
    for (const u of [gestao, coord, recepcao, gestaoB, prof, profInativa, familia, familiaKids, outraFamilia, familiaB, ...familiasExtras]) {
      if (u) await deleteTestUser(u.id);
    }
    if (escolaA) await deleteTestSchool(escolaA);
    if (escolaB) await deleteTestSchool(escolaB);
  });

  it('Gestão e Coordenação criam e publicam; Recepção, professora e família não', async () => {
    const id = await criar(gestao);
    expect(await publicar(gestao, id)).toBeNull();
    const c = await criar(coord);
    expect(await publicar(coord, c)).toBeNull();
    for (const u of [recepcao, prof, familia]) {
      const r = await u.client.rpc('pesquisa_salvar', { p_id: null, p_dados: dados(), p_perguntas: perguntas });
      expect(r.error).not.toBeNull();
    }
  });

  it('ninguém escreve direto nas tabelas e o cliente não lê respostas', async () => {
    const id = await criar(gestao);
    await publicar(gestao, id);
    await responderPergunta(familia, id);
    const ins = await gestao.client.from('surveys').insert({ school_id: escolaA, titulo: 'Direto', publico: 'familias', fecha_em: new Date(Date.now() + 1e6).toISOString() });
    expect(ins.error).not.toBeNull();
    const upd = await gestao.client.from('surveys').update({ titulo: 'Mudou' }).eq('id', id).select('id');
    expect(upd.data ?? []).toHaveLength(0);
    for (const t of ['survey_responses', 'survey_answers', 'survey_participation']) {
      expect((await gestao.client.from(t).select('*').eq('survey_id', id)).data ?? []).toHaveLength(0);
    }
    expect((await familia.client.from('surveys').select('id')).data ?? []).toHaveLength(0);
  });

  it('pesquisa publicada não se edita nem se exclui; rascunho sim', async () => {
    const id = await criar(gestao);
    const edit = await gestao.client.rpc('pesquisa_salvar', { p_id: id, p_dados: dados({ titulo: 'Novo título' }), p_perguntas: perguntas });
    expect(edit.error).toBeNull();
    await publicar(gestao, id);
    const depois = await gestao.client.rpc('pesquisa_salvar', { p_id: id, p_dados: dados({ titulo: 'Outro' }), p_perguntas: perguntas });
    expect(depois.error).not.toBeNull();
    expect((await gestao.client.rpc('pesquisa_excluir', { p_id: id })).error).not.toBeNull();
    const rasc = await criar(gestao);
    expect((await gestao.client.rpc('pesquisa_excluir', { p_id: rasc })).error).toBeNull();
  });

  it('só publica com pergunta e valida público e datas', async () => {
    const vazia = await criar(gestao, {}, []);
    expect(await publicar(gestao, vazia)).not.toBeNull();
    const semTurma = await gestao.client.rpc('pesquisa_salvar', { p_id: null, p_dados: dados({ publico: 'turmas' }), p_perguntas: perguntas });
    expect(semTurma.error).not.toBeNull();
    const datas = await gestao.client.rpc('pesquisa_salvar', {
      p_id: null, p_dados: dados({ fecha_em: new Date(Date.now() - 3600_000).toISOString() }), p_perguntas: perguntas,
    });
    expect(datas.error).not.toBeNull();
  });

  it('família responde uma vez só e a resposta aparece nos resultados', async () => {
    const id = await criar(gestao);
    await publicar(gestao, id);
    expect((await responderPergunta(familia, id, 10)).error).toBeNull();
    expect((await responderPergunta(familia, id, 1)).error).not.toBeNull();
    const abertas = (await familia.client.rpc('pesquisas_abertas')).data.find(p => p.id === id);
    expect(abertas.respondida).toBe(true);
    const res = (await gestao.client.rpc('pesquisa_resultados', { p_id: id })).data;
    expect(res.respostas).toBe(1);
    expect(res.perguntas[0].distribuicao['10']).toBe(1);
    expect(res.elegiveis).toBeGreaterThanOrEqual(1);
  });

  it('resposta anônima não liga ao usuário e some abaixo de 5 respostas', async () => {
    const id = await criar(gestao, { anonima: true });
    await publicar(gestao, id);
    await responderPergunta(familia, id, 3, 'App', 'Texto secreto');
    const linhas = (await adminClient.from('survey_responses').select('user_id, segmento').eq('survey_id', id)).data;
    expect(linhas).toHaveLength(1);
    expect(linhas[0].user_id).toBeNull();
    const part = (await adminClient.from('survey_participation').select('user_id').eq('survey_id', id)).data;
    expect(part.map(p => p.user_id)).toEqual([familia.id]);
    const res = (await gestao.client.rpc('pesquisa_resultados', { p_id: id })).data;
    expect(res.oculto).toBe(true);
    expect(res.perguntas[0].distribuicao).toBeUndefined();
    const q = (await adminClient.from('survey_questions').select('id').eq('survey_id', id).eq('tipo', 'texto').single()).data;
    const textos = await gestao.client.rpc('pesquisa_textos', { p_id: id, p_question_id: q.id });
    expect(textos.data ?? []).toHaveLength(0);
  });

  it('anônima com 5 respostas mostra o resultado, o segmento e o texto sem autor', async () => {
    const id = await criar(gestao, { anonima: true });
    await publicar(gestao, id);
    const extras = [];
    for (let i = 0; i < 4; i += 1) {
      const u = await createTestUser({ role: 'family', schoolId: escolaA });
      familiasExtras.push(u); extras.push(u);
      await adminClient.from('students').insert({ school_id: escolaA, name: `Vitest Extra ${i}`, turma: 'Nido', family_id: u.id });
    }
    for (const u of [familia, ...extras]) expect((await responderPergunta(u, id, 8)).error).toBeNull();
    const res = (await gestao.client.rpc('pesquisa_resultados', { p_id: id })).data;
    expect(res.oculto).toBe(false);
    expect(res.perguntas[0].distribuicao['8']).toBe(5);
    expect(res.perguntas[0].segmentos).toHaveLength(1);
    expect(res.perguntas[0].segmentos[0].segmento).toBe('Nido');
    const q = (await adminClient.from('survey_questions').select('id').eq('survey_id', id).eq('tipo', 'texto').single()).data;
    const textos = (await gestao.client.rpc('pesquisa_textos', { p_id: id, p_question_id: q.id })).data;
    expect(textos).toHaveLength(5);
    expect(textos.every(t => t.autor === null)).toBe(true);
  });

  it('segmento com menos de 5 respostas não aparece, mesmo em pesquisa aberta', async () => {
    const id = await criar(gestao);
    await publicar(gestao, id);
    await responderPergunta(outraFamilia, id, 7);
    const res = (await gestao.client.rpc('pesquisa_resultados', { p_id: id })).data;
    expect(res.perguntas[0].segmentos).toHaveLength(0);
    const q = (await adminClient.from('survey_questions').select('id').eq('survey_id', id).eq('tipo', 'texto').single()).data;
    const textos = (await gestao.client.rpc('pesquisa_textos', { p_id: id, p_question_id: q.id })).data;
    expect(textos[0].autor).not.toBeNull();
  });

  it('público: turmas só para famílias da turma, equipe só para professora ativa', async () => {
    const t = await criar(gestao, { publico: 'turmas', turmas: ['Kids'] });
    await publicar(gestao, t);
    expect((await familiaKids.client.rpc('pesquisas_abertas')).data.some(p => p.id === t)).toBe(true);
    expect((await familia.client.rpc('pesquisas_abertas')).data.some(p => p.id === t)).toBe(false);
    expect((await responderPergunta(familia, t)).error).not.toBeNull();
    expect((await responderPergunta(familiaKids, t)).error).toBeNull();

    const e = await criar(gestao, { publico: 'equipe' });
    await publicar(gestao, e);
    expect((await prof.client.rpc('pesquisas_abertas')).data.some(p => p.id === e)).toBe(true);
    expect((await profInativa.client.rpc('pesquisas_abertas')).data.some(p => p.id === e)).toBe(false);
    expect((await familia.client.rpc('pesquisas_abertas')).data.some(p => p.id === e)).toBe(false);
    expect((await responderPergunta(familia, e)).error).not.toBeNull();
    expect((await responderPergunta(prof, e)).error).toBeNull();
  });

  it('respostas inválidas são barradas e a participação não fica gravada', async () => {
    const id = await criar(gestao);
    await publicar(gestao, id);
    const ps = (await adminClient.from('survey_questions').select('id, tipo').eq('survey_id', id).order('ordem')).data;
    const nps = ps.find(q => q.tipo === 'nps');
    const multi = ps.find(q => q.tipo === 'multipla');
    const tentar = (valores) => familiaKids.client.rpc('pesquisa_responder', { p_id: id, p_respostas: valores });
    expect((await tentar([{ question_id: nps.id, valor: '11' }, { question_id: multi.id, valor: 'App' }])).error).not.toBeNull();
    expect((await tentar([{ question_id: nps.id, valor: '5' }, { question_id: multi.id, valor: 'Pombo' }])).error).not.toBeNull();
    expect((await tentar([{ question_id: nps.id, valor: '5' }])).error).not.toBeNull();
    const part = (await adminClient.from('survey_participation').select('user_id').eq('survey_id', id)).data;
    expect(part).toHaveLength(0);
    expect((await tentar([{ question_id: nps.id, valor: '5' }, { question_id: multi.id, valor: 'App' }])).error).toBeNull();
  });

  it('encerrada, fora do prazo ou módulo desligado não aceitam resposta', async () => {
    const id = await criar(gestao);
    await publicar(gestao, id);
    expect((await gestao.client.rpc('pesquisa_encerrar', { p_id: id })).error).toBeNull();
    expect((await responderPergunta(familia, id)).error).not.toBeNull();

    const outra = await criar(gestao);
    await publicar(gestao, outra);
    await adminClient.from('schools').update({ features_enabled: { avaliacao_institucional: false } }).eq('id', escolaA);
    try {
      expect((await familia.client.rpc('pesquisas_abertas')).data ?? []).toHaveLength(0);
      expect((await responderPergunta(familia, outra)).error).not.toBeNull();
      expect((await gestao.client.from('surveys').select('id')).data ?? []).toHaveLength(0);
    } finally {
      await adminClient.from('schools').update({ features_enabled: { avaliacao_institucional: true } }).eq('id', escolaA);
    }
  });

  it('outra escola não vê nem responde', async () => {
    const id = await criar(gestao);
    await publicar(gestao, id);
    expect((await gestaoB.client.from('surveys').select('id').eq('id', id)).data ?? []).toHaveLength(0);
    expect((await gestaoB.client.rpc('pesquisa_resultados', { p_id: id })).error).not.toBeNull();
    expect((await gestaoB.client.rpc('pesquisa_publicar', { p_id: id })).error).not.toBeNull();
    expect((await familiaB.client.rpc('pesquisas_abertas')).data ?? []).toHaveLength(0);
    expect((await responderPergunta(familiaB, id)).error).not.toBeNull();
  });
});
