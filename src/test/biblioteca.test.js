import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Biblioteca (PLANO_EXPANSAO_GESTAO.md, item 4): RLS por escola e por perfil,
// empréstimo único por exemplar, vínculo entre escolas barrado, família só nos filhos.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario({ modulo = true } = {}) {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  if (modulo) {
    await adminClient.from('schools').update({ features_enabled: { biblioteca: true } }).in('id', [schoolA, schoolB]);
  }
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const prof = await createTestUser({ role: 'teacher', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const outraFamilia = await createTestUser({ role: 'family', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });

  const { data: aluno } = await adminClient.from('students')
    .insert({ school_id: schoolA, name: 'Vitest Aluno Biblioteca', turma: 'Nido', family_id: familia.id }).select('id').single();
  const { data: alunoB } = await adminClient.from('students')
    .insert({ school_id: schoolB, name: 'Vitest Aluno Outra Escola', turma: 'Nido' }).select('id').single();

  const { data: livro } = await adminClient.from('library_items')
    .insert({ school_id: schoolA, titulo: 'Vitest O Pequeno Principe' }).select('id').single();
  const { data: ex1 } = await adminClient.from('library_copies')
    .insert({ school_id: schoolA, item_id: livro.id, tombo: 'T1' }).select('id').single();
  const { data: ex2 } = await adminClient.from('library_copies')
    .insert({ school_id: schoolA, item_id: livro.id, tombo: 'T2' }).select('id').single();

  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const limpar = async () => {
    await adminClient.from('library_loans').delete().in('school_id', [schoolA, schoolB]);
    await adminClient.from('library_copies').delete().in('school_id', [schoolA, schoolB]);
    await adminClient.from('library_items').delete().in('school_id', [schoolA, schoolB]);
    await adminClient.from('school_role_permissions').delete().eq('school_id', schoolA);
    await adminClient.from('students').delete().in('school_id', [schoolA, schoolB]);
    for (const u of [gestao, coord, recepcao, prof, familia, outraFamilia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, coord, recepcao, prof, familia, outraFamilia, gestaoB, aluno, alunoB, livro, ex1, ex2, amanha, limpar };
}

const emprestar = (client, copy, aluno, ate) => client.rpc('library_emprestar', {
  p_copy_id: copy, p_borrower_type: 'aluno', p_student_id: aluno, p_user_id: null, p_devolver_ate: ate,
});

runIf('Biblioteca · RLS e RPCs', () => {
  it('Gestão e Coordenação gerenciam; Recepção e Professora só com a permissão; Família nunca', async () => {
    const c = await montaCenario();
    try {
      for (const u of [c.gestao, c.coord]) {
        const { data, error } = await u.client.from('library_items').select('id');
        expect(error).toBeNull();
        expect(data.length).toBe(1);
      }
      for (const u of [c.recepcao, c.prof, c.familia]) {
        const { data } = await u.client.from('library_items').select('id');
        expect(data).toEqual([]);
      }
      const { error: semPerm } = await emprestar(c.recepcao.client, c.ex1.id, c.aluno.id, c.amanha);
      expect(semPerm).not.toBeNull();

      await adminClient.from('school_role_permissions').insert([
        { school_id: c.schoolA, role: 'admin', permission: 'biblioteca.gerenciar', granted: true },
        { school_id: c.schoolA, role: 'teacher', permission: 'biblioteca.gerenciar', granted: true },
      ]);
      const { data: itensRecepcao } = await c.recepcao.client.from('library_items').select('id');
      expect(itensRecepcao.length).toBe(1);
      const { error: comPerm } = await emprestar(c.prof.client, c.ex1.id, c.aluno.id, c.amanha);
      expect(comPerm).toBeNull();
    } finally {
      await c.limpar();
    }
  });

  it('módulo desligado bloqueia leitura e escrita, até da Gestão', async () => {
    const c = await montaCenario({ modulo: false });
    try {
      const { data } = await c.gestao.client.from('library_items').select('id');
      expect(data).toEqual([]);
      const { error } = await emprestar(c.gestao.client, c.ex1.id, c.aluno.id, c.amanha);
      expect(error).not.toBeNull();
      const { error: insErr } = await c.gestao.client.from('library_items')
        .insert({ school_id: c.schoolA, titulo: 'Vitest sem modulo' });
      expect(insErr).not.toBeNull();
    } finally {
      await c.limpar();
    }
  });

  it('um exemplar não tem dois empréstimos abertos e volta a ficar livre após a devolução', async () => {
    const c = await montaCenario();
    try {
      const { data: loanId, error } = await emprestar(c.gestao.client, c.ex1.id, c.aluno.id, c.amanha);
      expect(error).toBeNull();
      const { error: dup } = await emprestar(c.coord.client, c.ex1.id, c.aluno.id, c.amanha);
      expect(dup?.message).toMatch(/já está emprestado/);

      const { error: devErr } = await c.coord.client.rpc('library_devolver', { p_loan_id: loanId });
      expect(devErr).toBeNull();
      const { error: devDois } = await c.coord.client.rpc('library_devolver', { p_loan_id: loanId });
      expect(devDois).not.toBeNull();
      const { error: novo } = await emprestar(c.gestao.client, c.ex1.id, c.aluno.id, c.amanha);
      expect(novo).toBeNull();
    } finally {
      await c.limpar();
    }
  });

  it('barra vínculo entre escolas e data inválida', async () => {
    const c = await montaCenario();
    try {
      const { error: alunoOutra } = await emprestar(c.gestao.client, c.ex1.id, c.alunoB.id, c.amanha);
      expect(alunoOutra).not.toBeNull();
      const { error: exOutra } = await emprestar(c.gestaoB.client, c.ex1.id, c.alunoB.id, c.amanha);
      expect(exOutra).not.toBeNull();
      const { error: passado } = await emprestar(c.gestao.client, c.ex1.id, c.aluno.id, '2020-01-01');
      expect(passado).not.toBeNull();
      // Gestão de outra escola não enxerga o acervo.
      const { data } = await c.gestaoB.client.from('library_items').select('id');
      expect(data).toEqual([]);
    } finally {
      await c.limpar();
    }
  });

  it('empréstimo para funcionário só vale para equipe da mesma escola, nunca família', async () => {
    const c = await montaCenario();
    try {
      const func = (userId) => c.gestao.client.rpc('library_emprestar', {
        p_copy_id: c.ex2.id, p_borrower_type: 'funcionario', p_student_id: null, p_user_id: userId, p_devolver_ate: c.amanha,
      });
      expect((await func(c.familia.id)).error).not.toBeNull();
      expect((await func(c.gestaoB.id)).error).not.toBeNull();
      expect((await func(c.prof.id)).error).toBeNull();
    } finally {
      await c.limpar();
    }
  });

  it('ninguém apaga nem altera empréstimo direto; só a RPC devolve', async () => {
    const c = await montaCenario();
    try {
      const { data: loanId } = await emprestar(c.gestao.client, c.ex1.id, c.aluno.id, c.amanha);
      const { data: del } = await c.gestao.client.from('library_loans').delete().eq('id', loanId).select('id');
      expect(del ?? []).toEqual([]);
      const { data: upd } = await c.gestao.client.from('library_loans')
        .update({ devolvido_em: new Date().toISOString() }).eq('id', loanId).select('id');
      expect(upd ?? []).toEqual([]);
      const { data: ainda } = await c.gestao.client.from('library_loans').select('id, devolvido_em').eq('id', loanId);
      expect(ainda[0].devolvido_em).toBeNull();
      const { data: delCopy } = await c.gestao.client.from('library_copies').delete().eq('id', c.ex1.id).select('id');
      expect(delCopy ?? []).toEqual([]);
    } finally {
      await c.limpar();
    }
  });

  it('família vê só os livros dos próprios filhos', async () => {
    const c = await montaCenario();
    try {
      await emprestar(c.gestao.client, c.ex1.id, c.aluno.id, c.amanha);
      const { data: meus, error } = await c.familia.client.rpc('library_meus_emprestimos');
      expect(error).toBeNull();
      expect(meus.length).toBe(1);
      expect(meus[0].titulo).toBe('Vitest O Pequeno Principe');
      const { data: alheios } = await c.outraFamilia.client.rpc('library_meus_emprestimos');
      expect(alheios).toEqual([]);
      const { data: direto } = await c.familia.client.from('library_loans').select('id');
      expect(direto).toEqual([]);
      const { data: daEquipe } = await c.gestao.client.rpc('library_meus_emprestimos');
      expect(daEquipe).toEqual([]);
    } finally {
      await c.limpar();
    }
  });
});
