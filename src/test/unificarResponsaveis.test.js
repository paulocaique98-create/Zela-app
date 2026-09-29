import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Unificação supervisionada dos 2º responsáveis: o outro pai/mãe cadastrado
// como Autorizado "Pai/Mãe" na conta do titular passa para a conta própria
// dele (ou o cadastro antigo sai, se a conta já tem a biometria).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function pessoa(schoolId, familyId, name, relation, comBio) {
  const { data, error } = await adminClient.from('authorized_persons').insert({
    school_id: schoolId, family_id: familyId, name, relation, status: 'approved',
    has_photo: comBio,
    face_descriptor: comBio ? JSON.stringify([0.1, 0.2]) : null,
    photo_storage_path: comBio ? `${schoolId}/${name.replace(/\s/g, '')}.jpg` : null,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

runIf('Unificação: autorizado repetido na mesma família', () => {
  it('família com dois titulares: fica um cadastro só, na conta que cobre todas as crianças', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const pai = await createTestUser({ role: 'family', schoolId, extra: { name: 'Vitest Pai Titular' } });
    const mae = await createTestUser({ role: 'family', schoolId, extra: { name: 'Vitest Mae Titular' } });
    const tia = await createTestUser({ role: 'family', schoolId, extra: { name: 'Vitest Tia Parcial' } });
    try {
      const { data: alunos } = await adminClient.from('students').insert([
        { school_id: schoolId, name: 'Vitest Filho Davi', family_id: pai.id },
        { school_id: schoolId, name: 'Vitest Filha Joana', family_id: mae.id },
      ]).select('id, name');
      const davi = alunos.find(a => a.name.includes('Davi')).id;
      const joana = alunos.find(a => a.name.includes('Joana')).id;
      await adminClient.from('student_guardians').insert([
        { student_id: davi, guardian_id: pai.id, school_id: schoolId, is_primary: true, is_financial: true },
        { student_id: davi, guardian_id: mae.id, school_id: schoolId, is_primary: false },
        { student_id: joana, guardian_id: mae.id, school_id: schoolId, is_primary: true, is_financial: true },
        { student_id: joana, guardian_id: pai.id, school_id: schoolId, is_primary: false },
        { student_id: davi, guardian_id: tia.id, school_id: schoolId, is_primary: false },
      ]);
      // Babá nas contas do pai e da mãe (as duas cobrem Davi e Joana).
      const babaPai = await pessoa(schoolId, pai.id, 'Rosalia', 'Autorizado', false);
      const babaMae = await pessoa(schoolId, mae.id, 'Rosalia', 'Autorizado', false);
      // Motorista na conta da tia (só Davi) e na do pai (Davi e Joana).
      const motTia = await pessoa(schoolId, tia.id, 'Vitest Motorista', 'Outro', false);
      const motPai = await pessoa(schoolId, pai.id, 'Vitest Motorista', 'Outro', true);

      const { data: lista } = await gestao.client.rpc('list_unificar_responsaveis');
      const repetidos = lista.filter(l => l.acao === 'autorizado_repetido');
      // Uma cópia da babá sai (a de maior id, sem biometria nas duas); a do motorista que sai é a da tia.
      const sai = [babaPai, babaMae].sort()[1];
      expect(repetidos.map(r => r.legacy_id).sort()).toEqual([sai, motTia].sort());
      expect(repetidos.find(r => r.legacy_id === motTia).guardian_id).toBe(pai.id);
      expect(lista.find(l => l.legacy_id === motPai)).toBeUndefined();

      const { error } = await gestao.client.rpc('apply_unificar_responsaveis', { p_legacy_ids: repetidos.map(r => r.legacy_id) });
      expect(error).toBeNull();
      const { data: restam } = await adminClient.from('authorized_persons').select('id').in('id', [babaPai, babaMae, motTia, motPai]);
      expect(restam.map(r => r.id).sort()).toEqual([[babaPai, babaMae].sort()[0], motPai].sort());
    } finally {
      await adminClient.from('student_guardians').delete().eq('school_id', schoolId);
      await adminClient.from('authorized_persons').delete().eq('school_id', schoolId);
      await adminClient.from('students').delete().eq('school_id', schoolId);
      for (const u of [gestao, pai, mae, tia]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  }, 30000);
});

runIf('Unificação dos 2º responsáveis', () => {
  it('lista e aplica: mover, remover antigo e duplicado; não mexe em avô de mesmo nome; só a Gestão', async () => {
    const schoolId = await createTestSchool();
    const gestao = await createTestUser({ role: 'gestao', schoolId });
    const admin = await createTestUser({ role: 'admin', schoolId });
    const titular = await createTestUser({ role: 'family', schoolId, extra: { name: 'Vitest Titular Maria' } });
    const pai = await createTestUser({ role: 'family', schoolId, extra: { name: 'Carlos Henrique Duarte Lima' } });
    const mae2 = await createTestUser({ role: 'family', schoolId, extra: { name: 'Vitest Segunda Mae' } });
    const titular2 = await createTestUser({ role: 'family', schoolId, extra: { name: 'Vitest Titular Joana' } });
    try {
      const { data: alunos } = await adminClient.from('students').insert([
        { school_id: schoolId, name: 'Vitest Aluno A', family_id: titular.id },
        { school_id: schoolId, name: 'Vitest Aluno B', family_id: titular2.id },
      ]).select('id, name');
      const alunoA = alunos.find(a => a.name === 'Vitest Aluno A').id;
      const alunoB = alunos.find(a => a.name === 'Vitest Aluno B').id;
      await adminClient.from('student_guardians').insert([
        { student_id: alunoA, guardian_id: titular.id, school_id: schoolId, is_primary: true },
        { student_id: alunoA, guardian_id: pai.id, school_id: schoolId, is_primary: false },
        { student_id: alunoB, guardian_id: titular2.id, school_id: schoolId, is_primary: true },
        { student_id: alunoB, guardian_id: mae2.id, school_id: schoolId, is_primary: false },
      ]);

      // Pai: conta com cadastro vazio; biometria no antigo "Carlos Lima" (Pai/Mãe) do titular.
      const placeholderPai = await pessoa(schoolId, pai.id, 'Carlos Henrique Duarte Lima', 'Pai', false);
      const antigoPai = await pessoa(schoolId, titular.id, 'Carlos Lima', 'Pai/Mãe', true);
      // Avô com mesmo primeiro nome e sobrenome: não é o pai.
      const avo = await pessoa(schoolId, titular.id, 'Carlos Alberto Lima', 'Avô/Avó', true);
      // Segunda mãe: conta já tem biometria; antigo no titular2 também.
      await pessoa(schoolId, mae2.id, 'Vitest Segunda Mae', 'Mãe', true);
      const antigoMae2 = await pessoa(schoolId, titular2.id, 'Vitest Segunda Mae', 'Pai/Mãe', true);
      // Titular repetida na própria conta como "Pai/Mãe" vazio.
      await pessoa(schoolId, titular.id, 'Vitest Titular Maria', 'Responsável (Titular)', true);
      const duplicado = await pessoa(schoolId, titular.id, 'Vitest Titular Maria', 'Pai/Mãe', false);

      const { error: adminErr } = await admin.client.rpc('list_unificar_responsaveis');
      expect(adminErr).not.toBeNull();
      const { error: adminApply } = await admin.client.rpc('apply_unificar_responsaveis', { p_legacy_ids: [antigoPai] });
      expect(adminApply).not.toBeNull();

      const { data: lista, error } = await gestao.client.rpc('list_unificar_responsaveis');
      expect(error).toBeNull();
      const porId = Object.fromEntries(lista.map(l => [l.legacy_id, l]));
      expect(porId[antigoPai]).toMatchObject({ acao: 'mover', guardian_name: 'Carlos Henrique Duarte Lima', nome_igual: false });
      expect(porId[antigoMae2]).toMatchObject({ acao: 'remover_antigo', nome_igual: true });
      expect(porId[duplicado]).toMatchObject({ acao: 'remover_duplicado' });
      expect(porId[avo]).toBeUndefined();
      expect(lista).toHaveLength(3);

      const idForaDaLista = avo;
      const { data: feitos, error: applyErr } = await gestao.client.rpc('apply_unificar_responsaveis', {
        p_legacy_ids: [antigoPai, antigoMae2, duplicado, idForaDaLista],
      });
      expect(applyErr).toBeNull();
      expect(feitos.map(f => f.acao).sort()).toEqual(['mover', 'remover_antigo', 'remover_duplicado']);
      expect(feitos.find(f => f.legacy_id === antigoMae2).photo_storage_path).toBe(`${schoolId}/VitestSegundaMae.jpg`);

      // O cadastro com a biometria agora é da conta do pai, com o nome da conta; o vazio sumiu.
      const { data: movido } = await adminClient.from('authorized_persons').select('family_id, name, relation, face_descriptor').eq('id', antigoPai).single();
      expect(movido).toMatchObject({ family_id: pai.id, name: 'Carlos Henrique Duarte Lima', relation: 'Pai' });
      expect(movido.face_descriptor).not.toBeNull();
      const { data: sobras } = await adminClient.from('authorized_persons').select('id').in('id', [placeholderPai, antigoMae2, duplicado]);
      expect(sobras).toEqual([]);
      const { data: avoDepois } = await adminClient.from('authorized_persons').select('family_id').eq('id', avo).single();
      expect(avoDepois.family_id).toBe(titular.id);

      // 2º responsável vinculado a só uma das crianças do titular: fica fora
      // (tirar o antigo tiraria a permissão de buscar a outra no totem).
      const { data: alunoC } = await adminClient.from('students').insert({ school_id: schoolId, name: 'Vitest Aluno C', family_id: titular2.id }).select('id').single();
      await adminClient.from('student_guardians').insert({ student_id: alunoC.id, guardian_id: titular2.id, school_id: schoolId, is_primary: true });
      const antigoParcial = await pessoa(schoolId, titular2.id, 'Vitest Segunda Mae', 'Mãe', false);
      const { data: listaParcial } = await gestao.client.rpc('list_unificar_responsaveis');
      expect(listaParcial.find(l => l.legacy_id === antigoParcial)).toBeUndefined();
      await adminClient.from('authorized_persons').delete().eq('id', antigoParcial);

      // Nada mais a unificar; ficou registrado na auditoria.
      const { data: listaDepois } = await gestao.client.rpc('list_unificar_responsaveis');
      expect(listaDepois).toEqual([]);
      const { data: logs } = await adminClient.from('audit_logs').select('details').eq('school_id', schoolId).eq('action', 'unificar_responsaveis');
      expect(logs[0].details.quantidade).toBe(3);
    } finally {
      await adminClient.from('student_guardians').delete().eq('school_id', schoolId);
      await adminClient.from('authorized_persons').delete().eq('school_id', schoolId);
      await adminClient.from('students').delete().eq('school_id', schoolId);
      for (const u of [gestao, admin, titular, pai, mae2, titular2]) await deleteTestUser(u.id);
      await deleteTestSchool(schoolId);
    }
  });
});
