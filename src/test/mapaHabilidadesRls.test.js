import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Mapa de Habilidades: isolamento entre escolas, quem cria, quem publica e
// o que a família enxerga. Roda contra o Supabase LOCAL (Docker).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Mapa de Habilidades (RLS)', () => {
  const c = {};
  const reg = (extra = {}) => ({
    school_id: c.escolaA, student_id: c.alunoA, habilidade_id: c.habA, ano: 2026, semestre: 2,
    situacao: 'adquirindo', status: 'RASCUNHO', ...extra,
  });

  beforeAll(async () => {
    c.escolaA = await createTestSchool();
    c.escolaB = await createTestSchool();
    c.prof = await createTestUser({ role: 'teacher', schoolId: c.escolaA, extra: { teacher_status: 'ativo', turmas: ['Nido'] } });
    c.profOutraTurma = await createTestUser({ role: 'teacher', schoolId: c.escolaA, extra: { teacher_status: 'ativo', turmas: ['Kids'] } });
    c.profB = await createTestUser({ role: 'teacher', schoolId: c.escolaB, extra: { teacher_status: 'ativo', turmas: ['Nido'] } });
    c.coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: c.escolaA, extra: { departamento: 'coordenacao' } });
    c.coordRecepcao = await createTestUser({ role: 'admin', schoolId: c.escolaA, extra: { departamento: 'coordenacao' } });
    c.recepcao = await createTestUser({ role: 'admin', schoolId: c.escolaA, extra: { departamento: 'recepcao' } });
    c.gestao = await createTestUser({ role: 'gestao', schoolId: c.escolaA });
    c.familia = await createTestUser({ role: 'family', schoolId: c.escolaA, extra: { doc_number: '99988877766' } });
    c.outraFamilia = await createTestUser({ role: 'family', schoolId: c.escolaA, extra: { doc_number: '55544433322' } });

    const { data: alunos, error } = await adminClient.from('students').insert([
      { school_id: c.escolaA, name: 'Vitest Mapa Aluno', turma: 'Nido', family_id: c.familia.id, birth_date: '2025-08-05' },
      { school_id: c.escolaA, name: 'Vitest Mapa Outro', turma: 'Kids', family_id: c.outraFamilia.id, birth_date: '2023-01-05' },
      { school_id: c.escolaB, name: 'Vitest Mapa Escola B', turma: 'Nido', birth_date: '2025-08-05' },
    ]).select('id, name');
    if (error) throw error;
    c.alunoA = alunos.find(a => a.name === 'Vitest Mapa Aluno').id;
    c.alunoKids = alunos.find(a => a.name === 'Vitest Mapa Outro').id;
    c.alunoB = alunos.find(a => a.name === 'Vitest Mapa Escola B').id;

    const { data: habs, error: e2 } = await adminClient.from('mapa_habilidades').insert([
      { school_id: c.escolaA, area: 'Vida Prática', descricao: 'Colocar o chinelo', idade_min_meses: 12, idade_max_meses: 18 },
      { school_id: c.escolaA, area: 'Linguagem', descricao: 'Reconhecer letras', idade_min_meses: 12, idade_max_meses: 36 },
      { school_id: c.escolaB, area: 'Vida Prática', descricao: 'Habilidade da escola B', idade_min_meses: 12, idade_max_meses: 18 },
    ]).select('id, descricao');
    if (e2) throw e2;
    c.habA = habs.find(h => h.descricao === 'Colocar o chinelo').id;
    c.habA2 = habs.find(h => h.descricao === 'Reconhecer letras').id;
    c.habB = habs.find(h => h.descricao === 'Habilidade da escola B').id;
  }, 90000);

  afterAll(async () => {
    for (const s of [c.escolaA, c.escolaB]) {
      if (!s) continue;
      await adminClient.from('audit_logs').delete().eq('school_id', s);
      await adminClient.from('mapa_habilidades_registros').delete().eq('school_id', s);
      await adminClient.from('mapa_habilidades').delete().eq('school_id', s);
      await adminClient.from('students').delete().eq('school_id', s);
    }
    for (const u of [c.prof, c.profOutraTurma, c.profB, c.coord, c.coordRecepcao, c.recepcao, c.gestao, c.familia, c.outraFamilia]) {
      if (u?.id) await deleteTestUser(u.id);
    }
    for (const s of [c.escolaA, c.escolaB]) if (s) await deleteTestSchool(s);
  }, 90000);

  describe('Professora', () => {
    it('lê o catálogo da própria escola e não vê o de outra', async () => {
      const { data } = await c.prof.client.from('mapa_habilidades').select('id').in('id', [c.habA, c.habB]);
      expect((data || []).map(h => h.id)).toEqual([c.habA]);
    });

    it('não altera o catálogo', async () => {
      const ins = await c.prof.client.from('mapa_habilidades').insert({ school_id: c.escolaA, area: 'X', descricao: 'Y', idade_min_meses: 1, idade_max_meses: 2, created_by: c.prof.id });
      expect(ins.error).not.toBeNull();
      await c.prof.client.from('mapa_habilidades').update({ descricao: 'Hackeada' }).eq('id', c.habA);
      const { data } = await adminClient.from('mapa_habilidades').select('descricao').eq('id', c.habA).single();
      expect(data.descricao).toBe('Colocar o chinelo');
    });

    it('cria rascunho para aluno da própria turma', async () => {
      const { data, error } = await c.prof.client.from('mapa_habilidades_registros').insert({ ...reg(), author_id: c.prof.id }).select('id, status').single();
      expect(error).toBeNull();
      expect(data.status).toBe('RASCUNHO');
      c.registro = data.id;
    });

    it('não cria registro de aluno de outra turma nem de outra escola', async () => {
      const outraTurma = await c.prof.client.from('mapa_habilidades_registros').insert({ ...reg({ student_id: c.alunoKids }), author_id: c.prof.id });
      expect(outraTurma.error).not.toBeNull();
      const outraEscola = await c.prof.client.from('mapa_habilidades_registros').insert({ ...reg({ student_id: c.alunoB, school_id: c.escolaB }), author_id: c.prof.id });
      expect(outraEscola.error).not.toBeNull();
    });

    it('não cria registro já publicado nem em nome de outra pessoa', async () => {
      const publicado = await c.prof.client.from('mapa_habilidades_registros').insert({ ...reg({ habilidade_id: c.habA2, status: 'PUBLICADO' }), author_id: c.prof.id });
      expect(publicado.error).not.toBeNull();
      const falso = await c.prof.client.from('mapa_habilidades_registros').insert({ ...reg({ habilidade_id: c.habA2 }), author_id: c.coord.id });
      expect(falso.error).not.toBeNull();
    });

    it('não mistura aluno da escola A com habilidade da escola B (gatilho)', async () => {
      const { error } = await adminClient.from('mapa_habilidades_registros').insert(reg({ habilidade_id: c.habB, author_id: c.prof.id }));
      expect(error).not.toBeNull();
    });

    it('não repete o mesmo registro no semestre', async () => {
      const { error } = await c.prof.client.from('mapa_habilidades_registros').insert({ ...reg(), author_id: c.prof.id });
      expect(error).not.toBeNull();
    });

    it('edita a situação do rascunho e não consegue publicar', async () => {
      const ok = await c.prof.client.from('mapa_habilidades_registros').update({ situacao: 'adquirido' }).eq('id', c.registro).select('situacao');
      expect(ok.data?.[0]?.situacao).toBe('adquirido');
      await c.prof.client.from('mapa_habilidades_registros').update({ status: 'PUBLICADO' }).eq('id', c.registro);
      const { data } = await adminClient.from('mapa_habilidades_registros').select('status').eq('id', c.registro).single();
      expect(data.status).toBe('RASCUNHO');
    });

    it('não troca o aluno nem a habilidade de um registro', async () => {
      const r = await c.prof.client.from('mapa_habilidades_registros').update({ habilidade_id: c.habA2 }).eq('id', c.registro);
      expect(r.error).not.toBeNull();
    });

    it('professora de outra turma não enxerga nem edita', async () => {
      const { data } = await c.profOutraTurma.client.from('mapa_habilidades_registros').select('id').eq('id', c.registro);
      expect(data).toEqual([]);
      await c.profOutraTurma.client.from('mapa_habilidades_registros').update({ situacao: 'sem_interesse' }).eq('id', c.registro);
      const { data: depois } = await adminClient.from('mapa_habilidades_registros').select('situacao').eq('id', c.registro).single();
      expect(depois.situacao).toBe('adquirido');
    });

    it('professora de outra escola não enxerga', async () => {
      const { data } = await c.profB.client.from('mapa_habilidades_registros').select('id');
      expect(data).toEqual([]);
    });

    it('não apaga registro', async () => {
      await c.prof.client.from('mapa_habilidades_registros').delete().eq('id', c.registro);
      const { data } = await adminClient.from('mapa_habilidades_registros').select('id').eq('id', c.registro);
      expect(data).toHaveLength(1);
    });
  });

  describe('Habilidade adquirida não volta', () => {
    it('barra novo registro em semestre posterior', async () => {
      const { error } = await adminClient.from('mapa_habilidades_registros').insert(reg({ ano: 2027, semestre: 1, author_id: c.prof.id }));
      expect(error).not.toBeNull();
    });
  });

  describe('Família antes da publicação', () => {
    it('não vê rascunho', async () => {
      const { data } = await c.familia.client.from('mapa_habilidades_registros').select('id');
      expect(data).toEqual([]);
    });
  });

  describe('Coordenação e Direção', () => {
    it('Gestão Pedagógica lê tudo da escola e não cria registro', async () => {
      const { data } = await c.coord.client.from('mapa_habilidades_registros').select('id').eq('id', c.registro);
      expect(data).toHaveLength(1);
      const ins = await c.coord.client.from('mapa_habilidades_registros').insert({ ...reg({ habilidade_id: c.habA2 }), author_id: c.coord.id });
      expect(ins.error).not.toBeNull();
    });

    it('Recepção sem departamento pedagógico lê mas não edita nem publica', async () => {
      const { data } = await c.recepcao.client.from('mapa_habilidades_registros').select('id').eq('id', c.registro);
      expect(data).toHaveLength(1);
      await c.recepcao.client.from('mapa_habilidades_registros').update({ status: 'PUBLICADO' }).eq('id', c.registro);
      const { data: depois } = await adminClient.from('mapa_habilidades_registros').select('status').eq('id', c.registro).single();
      expect(depois.status).toBe('RASCUNHO');
    });

    it('Gestão lê, mas não publica', async () => {
      const { data } = await c.gestao.client.from('mapa_habilidades_registros').select('id').eq('id', c.registro);
      expect(data).toHaveLength(1);
      await c.gestao.client.from('mapa_habilidades_registros').update({ status: 'PUBLICADO' }).eq('id', c.registro);
      const { data: depois } = await adminClient.from('mapa_habilidades_registros').select('status').eq('id', c.registro).single();
      expect(depois.status).toBe('RASCUNHO');
    });

    it('Coordenação (Recepção ou Gestão Pedagógica) publica', async () => {
      const r = await c.coord.client.from('mapa_habilidades_registros').update({ status: 'PUBLICADO' }).eq('id', c.registro).select('status, published_at, published_by');
      expect(r.data?.[0]?.status).toBe('PUBLICADO');
      expect(r.data[0].published_at).not.toBeNull();
      expect(r.data[0].published_by).toBe(c.coord.id);
    });

    it('professora não edita mais depois de publicado', async () => {
      await c.prof.client.from('mapa_habilidades_registros').update({ situacao: 'sem_interesse' }).eq('id', c.registro);
      const { data } = await adminClient.from('mapa_habilidades_registros').select('situacao').eq('id', c.registro).single();
      expect(data.situacao).toBe('adquirido');
    });

    it('correção depois de publicado vai para o histórico', async () => {
      const r = await c.coordRecepcao.client.from('mapa_habilidades_registros').update({ situacao: 'adquirindo' }).eq('id', c.registro).select('situacao');
      expect(r.data?.[0]?.situacao).toBe('adquirindo');
      const { data } = await adminClient.from('audit_logs').select('action, actor_id').eq('school_id', c.escolaA).eq('action', 'mapa_habilidades_corrigir');
      expect(data).toHaveLength(1);
      expect(data[0].actor_id).toBe(c.coordRecepcao.id);
    });

    it('mantém o catálogo e não mexe em outra escola', async () => {
      const ok = await c.coord.client.from('mapa_habilidades').insert({ school_id: c.escolaA, area: 'Sensorial', descricao: 'Encaixar cilindros', idade_min_meses: 12, idade_max_meses: 24, created_by: c.coord.id });
      expect(ok.error).toBeNull();
      const fora = await c.coord.client.from('mapa_habilidades').insert({ school_id: c.escolaB, area: 'Sensorial', descricao: 'Invasora', idade_min_meses: 12, idade_max_meses: 24, created_by: c.coord.id });
      expect(fora.error).not.toBeNull();
      const gestao = await c.gestao.client.from('mapa_habilidades').insert({ school_id: c.escolaA, area: 'Sensorial', descricao: 'Pela Gestão', idade_min_meses: 12, idade_max_meses: 24, created_by: c.gestao.id });
      expect(gestao.error).toBeNull();
    });

    it('faixa de idade inválida é recusada pelo banco', async () => {
      const { error } = await c.coord.client.from('mapa_habilidades').insert({ school_id: c.escolaA, area: 'X', descricao: 'Faixa invertida', idade_min_meses: 30, idade_max_meses: 12, created_by: c.coord.id });
      expect(error).not.toBeNull();
    });

    it('não apaga habilidade que já tem registro', async () => {
      const { error } = await c.coord.client.from('mapa_habilidades').delete().eq('id', c.habA);
      expect(error).not.toBeNull();
    });
  });

  describe('Família depois da publicação', () => {
    it('vê só o publicado do próprio filho e as habilidades correspondentes', async () => {
      const { data } = await c.familia.client.from('mapa_habilidades_registros').select('id, student_id');
      expect(data).toHaveLength(1);
      expect(data[0].student_id).toBe(c.alunoA);
      const { data: habs } = await c.familia.client.from('mapa_habilidades').select('id');
      expect((habs || []).map(h => h.id)).toEqual([c.habA]);
    });

    it('outra família não vê o filho alheio', async () => {
      const { data } = await c.outraFamilia.client.from('mapa_habilidades_registros').select('id');
      expect(data).toEqual([]);
    });

    it('família não escreve', async () => {
      const ins = await c.familia.client.from('mapa_habilidades_registros').insert({ ...reg({ habilidade_id: c.habA2 }), author_id: c.familia.id });
      expect(ins.error).not.toBeNull();
      await c.familia.client.from('mapa_habilidades_registros').update({ situacao: 'adquirido' }).eq('id', c.registro);
      const { data } = await adminClient.from('mapa_habilidades_registros').select('situacao').eq('id', c.registro).single();
      expect(data.situacao).toBe('adquirindo');
    });

    it('voltar para rascunho tira da vista da família', async () => {
      await c.coord.client.from('mapa_habilidades_registros').update({ status: 'RASCUNHO' }).eq('id', c.registro);
      const { data } = await c.familia.client.from('mapa_habilidades_registros').select('id');
      expect(data).toEqual([]);
    });
  });
});
