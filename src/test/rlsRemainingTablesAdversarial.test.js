import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// P2.4 (Prompt Mestre de Evolução) — comunicados, mural_fotos e
// matricula_solicitacoes nunca tinham sido testadas adversarialmente
// (só lidas as policies, nunca exploradas ao vivo).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Isolamento multi-tenant — comunicados e mural_fotos', () => {
  let schoolA, schoolB, adminA, familyA, familyB, comunicadoA, muralFotoA;

  beforeAll(async () => {
    schoolA = await createTestSchool('Vitest Comm A');
    schoolB = await createTestSchool('Vitest Comm B');
    adminA = await createTestUser({ role: 'admin', schoolId: schoolA });
    familyA = await createTestUser({ role: 'family', schoolId: schoolA });
    familyB = await createTestUser({ role: 'family', schoolId: schoolB });

    const { data: comunicado, error: cErr } = await adminClient
      .from('comunicados')
      .insert({ school_id: schoolA, title: 'Vitest', body: 'Teste', turmas: null, created_by: adminA.id })
      .select('id')
      .single();
    if (cErr) throw cErr;
    comunicadoA = comunicado.id;

    const { data: foto, error: fErr } = await adminClient
      .from('mural_fotos')
      .insert({ school_id: schoolA, storage_path: 'vitest/fake.png', turmas: null, uploaded_by: adminA.id })
      .select('id')
      .single();
    if (fErr) throw fErr;
    muralFotoA = foto.id;
  });

  afterAll(async () => {
    await adminClient.from('comunicados').delete().eq('id', comunicadoA);
    await adminClient.from('mural_fotos').delete().eq('id', muralFotoA);
    await deleteTestUser(adminA.id);
    await deleteTestUser(familyA.id);
    await deleteTestUser(familyB.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  });

  it('família da própria escola lê o comunicado (acesso legítimo preservado)', async () => {
    const { data } = await familyA.client.from('comunicados').select('id').eq('id', comunicadoA);
    expect(data).toHaveLength(1);
  });

  it('família de outra escola não lê o comunicado', async () => {
    const { data } = await familyB.client.from('comunicados').select('id').eq('id', comunicadoA);
    expect(data).toEqual([]);
  });

  it('família de outra escola não consegue editar o comunicado', async () => {
    const { data } = await familyB.client.from('comunicados').update({ title: 'Invadido' }).eq('id', comunicadoA).select();
    expect(data).toEqual([]);
  });

  it('família (mesmo da própria escola) não consegue criar comunicado — só admin', async () => {
    const { error } = await familyA.client.from('comunicados').insert({ school_id: schoolA, title: 'x', body: 'x', created_by: familyA.id });
    expect(error).not.toBeNull();
  });

  it('família de outra escola não lê a foto do mural', async () => {
    const { data } = await familyB.client.from('mural_fotos').select('id').eq('id', muralFotoA);
    expect(data).toEqual([]);
  });

  it('família de outra escola não consegue apagar a foto do mural', async () => {
    const { data } = await familyB.client.from('mural_fotos').delete().eq('id', muralFotoA).select();
    expect(data).toEqual([]);
    const { data: stillThere } = await adminClient.from('mural_fotos').select('id').eq('id', muralFotoA).maybeSingle();
    expect(stillThere).not.toBeNull();
  });
});

runIf('matricula_solicitacoes — isolamento e integridade pós-decisão do admin', () => {
  let schoolA, schoolB, adminA, familyA, familyB;

  beforeAll(async () => {
    schoolA = await createTestSchool('Vitest Matr A');
    schoolB = await createTestSchool('Vitest Matr B');
    adminA = await createTestUser({ role: 'admin', schoolId: schoolA });
    familyA = await createTestUser({ role: 'family', schoolId: schoolA });
    familyB = await createTestUser({ role: 'family', schoolId: schoolB });
  });

  afterAll(async () => {
    await deleteTestUser(adminA.id);
    await deleteTestUser(familyA.id);
    await deleteTestUser(familyB.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  });

  async function insertSolicitacao(schoolId, familyId, status = 'pending') {
    const { data, error } = await adminClient
      .from('matricula_solicitacoes')
      .insert({
        school_id: schoolId, family_id: familyId, status,
        responsavel_financeiro: { nome: 'Teste' }, criancas: [{ nome: 'Aluno Teste' }],
        transporte_autorizados: [], autorizados: [],
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  it('família de outra escola não lê a solicitação da família A', async () => {
    const id = await insertSolicitacao(schoolA, familyA.id);
    try {
      const { data } = await familyB.client.from('matricula_solicitacoes').select('id').eq('id', id);
      expect(data).toEqual([]);
    } finally {
      await adminClient.from('matricula_solicitacoes').delete().eq('id', id);
    }
  });

  it('CRÍTICO — família NÃO consegue mais editar a própria solicitação depois que o admin já aprovou (integridade pós-decisão)', async () => {
    const id = await insertSolicitacao(schoolA, familyA.id, 'approved');
    try {
      const { data, error } = await familyA.client
        .from('matricula_solicitacoes')
        .update({ responsavel_financeiro: { nome: 'Nome trocado depois de aprovado' } })
        .eq('id', id)
        .select();
      expect(data ?? []).toEqual([]);
      const { data: unchanged } = await adminClient.from('matricula_solicitacoes').select('status, responsavel_financeiro').eq('id', id).single();
      expect(unchanged.status).toBe('approved');
      expect(unchanged.responsavel_financeiro.nome).toBe('Teste');
      if (error) expect(error).not.toBeNull();
    } finally {
      await adminClient.from('matricula_solicitacoes').delete().eq('id', id);
    }
  });

  it('CRÍTICO — família NÃO consegue mais apagar a própria solicitação depois que o admin já rejeitou (preserva trilha de auditoria)', async () => {
    const id = await insertSolicitacao(schoolA, familyA.id, 'rejected');
    try {
      const { data } = await familyA.client.from('matricula_solicitacoes').delete().eq('id', id).select();
      expect(data ?? []).toEqual([]);
      const { data: stillThere } = await adminClient.from('matricula_solicitacoes').select('id').eq('id', id).maybeSingle();
      expect(stillThere).not.toBeNull();
    } finally {
      await adminClient.from('matricula_solicitacoes').delete().eq('id', id);
    }
  });

  it('família AINDA consegue editar/apagar a própria solicitação enquanto está pending (acesso legítimo preservado)', async () => {
    const id = await insertSolicitacao(schoolA, familyA.id, 'pending');
    try {
      const { data: updated } = await familyA.client
        .from('matricula_solicitacoes')
        .update({ responsavel_financeiro: { nome: 'Nome corrigido' } })
        .eq('id', id)
        .select();
      expect(updated).toHaveLength(1);
    } finally {
      await adminClient.from('matricula_solicitacoes').delete().eq('id', id);
    }
  });
});
