import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Ocorrências (PLANO_EXPANSAO_GESTAO.md, item 7), migration 20261115120000_ocorrencias:
// módulo desligado, família não lê ocorrência interna, ciência só pelo responsável,
// professora só das suas turmas e sem editar, versões ao editar, isolamento entre escolas.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Ocorrências (RLS e RPCs)', () => {
  let escolaA, escolaB, prof, profOutra, gestao, coord, recepcao, familia, outraFamilia, gestaoB;
  let alunoNido, alunoKids, alunoB;
  const criados = [];

  const base = (schoolId, studentId, userId, extra = {}) => ({
    school_id: schoolId, student_id: studentId, registrado_por: userId, tipo: 'comportamento',
    gravidade: 'leve', descricao: 'Vitest ocorrência', ...extra,
  });

  beforeAll(async () => {
    escolaA = await createTestSchool('Vitest Ocorrencias A');
    escolaB = await createTestSchool('Vitest Ocorrencias B');
    await adminClient.from('schools').update({ features_enabled: { ocorrencias: true } }).in('id', [escolaA, escolaB]);
    const t = (schoolId, turmas) => createTestUser({ role: 'teacher', schoolId, extra: { teacher_status: 'ativo', turmas } });
    prof = await t(escolaA, ['Nido']);
    profOutra = await t(escolaA, ['Kids']);
    gestao = await createTestUser({ role: 'gestao', schoolId: escolaA });
    coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: escolaA });
    recepcao = await createTestUser({ role: 'admin', schoolId: escolaA });
    familia = await createTestUser({ role: 'family', schoolId: escolaA });
    outraFamilia = await createTestUser({ role: 'family', schoolId: escolaA });
    gestaoB = await createTestUser({ role: 'gestao', schoolId: escolaB });
    const aluno = async (schoolId, turma, familyId) => (await adminClient.from('students')
      .insert({ school_id: schoolId, name: `Vitest Aluno ${turma}`, turma, family_id: familyId ?? null }).select('id').single()).data.id;
    alunoNido = await aluno(escolaA, 'Nido', familia.id);
    alunoKids = await aluno(escolaA, 'Kids', outraFamilia.id);
    alunoB = await aluno(escolaB, 'Nido');
    await adminClient.from('student_guardians').insert({ student_id: alunoNido, guardian_id: familia.id, school_id: escolaA });
  });

  afterAll(async () => {
    await adminClient.from('student_incident_versions').delete().in('school_id', [escolaA, escolaB]);
    await adminClient.from('student_incidents').delete().in('school_id', [escolaA, escolaB]);
    await adminClient.from('student_guardians').delete().eq('school_id', escolaA);
    await adminClient.from('students').delete().in('school_id', [escolaA, escolaB]);
    for (const u of [prof, profOutra, gestao, coord, recepcao, familia, outraFamilia, gestaoB]) if (u) await deleteTestUser(u.id);
    if (escolaA) await deleteTestSchool(escolaA);
    if (escolaB) await deleteTestSchool(escolaB);
  });

  const registrar = async (u, extra = {}, aluno = alunoNido) => {
    const r = await u.client.from('student_incidents').insert(base(escolaA, aluno, u.id, extra)).select('id').single();
    if (r.data) criados.push(r.data.id);
    return r;
  };

  it('professora registra para aluno da sua turma e lê só as que registrou', async () => {
    const { data, error } = await registrar(prof);
    expect(error).toBeNull();
    const meu = await prof.client.from('student_incidents').select('id').eq('id', data.id);
    expect(meu.data).toHaveLength(1);
    const dela = await profOutra.client.from('student_incidents').select('id').eq('id', data.id);
    expect(dela.data).toHaveLength(0);
  });

  it('professora não registra para aluno de outra turma, nem aplica medida, nem edita', async () => {
    expect((await registrar(prof, {}, alunoKids)).error).not.toBeNull();
    expect((await registrar(prof, { medida: 'advertencia' })).error).not.toBeNull();
    const { data } = await registrar(prof);
    await prof.client.from('student_incidents').update({ descricao: 'alterada' }).eq('id', data.id);
    const { data: lido } = await adminClient.from('student_incidents').select('descricao').eq('id', data.id).single();
    expect(lido.descricao).toBe('Vitest ocorrência');
  });

  it('não registra em nome de outra pessoa', async () => {
    const r = await prof.client.from('student_incidents').insert(base(escolaA, alunoNido, gestao.id));
    expect(r.error).not.toBeNull();
  });

  it('Recepção, família e outra escola não leem nem escrevem direto', async () => {
    const { data } = await registrar(prof, { visivel_familia: true });
    for (const u of [recepcao, familia, gestaoB]) {
      const r = await u.client.from('student_incidents').select('id').eq('id', data.id);
      expect(r.data ?? []).toHaveLength(0);
    }
    expect((await recepcao.client.from('student_incidents').insert(base(escolaA, alunoNido, recepcao.id))).error).not.toBeNull();
    expect((await familia.client.from('student_incidents').insert(base(escolaA, alunoNido, familia.id))).error).not.toBeNull();
  });

  it('Coordenação e Direção leem tudo da escola e registram com medida', async () => {
    const { data } = await registrar(prof);
    for (const u of [gestao, coord]) {
      const r = await u.client.from('student_incidents').select('id').eq('id', data.id);
      expect(r.data).toHaveLength(1);
    }
    const m = await registrar(coord, { medida: 'advertencia', medida_inicio: '2026-10-01', medida_fim: '2026-10-02' });
    expect(m.error).toBeNull();
  });

  it('editar guarda a versão anterior e a ciência volta a pendente', async () => {
    const { data } = await registrar(prof, { visivel_familia: true, exige_ciencia: true });
    expect((await familia.client.rpc('registrar_ciencia_ocorrencia', { p_id: data.id })).error).toBeNull();
    const { error } = await gestao.client.from('student_incidents').update({ descricao: 'Texto corrigido' }).eq('id', data.id);
    expect(error).toBeNull();
    const v = await gestao.client.from('student_incident_versions').select('versao, snapshot').eq('incident_id', data.id);
    expect(v.data).toHaveLength(1);
    expect(v.data[0].snapshot.descricao).toBe('Vitest ocorrência');
    const { data: lido } = await adminClient.from('student_incidents').select('ciencia_em').eq('id', data.id).single();
    expect(lido.ciencia_em).toBeNull();
  });

  it('família vê só ocorrência visível dos próprios filhos', async () => {
    const interna = (await registrar(prof)).data.id;
    const visivel = (await registrar(prof, { visivel_familia: true })).data.id;
    const deOutro = (await registrar(profOutra, { visivel_familia: true }, alunoKids)).data.id;
    const { data } = await familia.client.rpc('ocorrencias_minhas');
    const ids = data.map(o => o.id);
    expect(ids).toContain(visivel);
    expect(ids).not.toContain(interna);
    expect(ids).not.toContain(deOutro);
    expect(data.every(o => !('registrado_por' in o))).toBe(true);
  });

  it('ciência só pelo responsável do aluno e só quando visível e exigida', async () => {
    const { data } = await registrar(prof, { visivel_familia: true, exige_ciencia: true });
    expect((await outraFamilia.client.rpc('registrar_ciencia_ocorrencia', { p_id: data.id })).error).not.toBeNull();
    expect((await prof.client.rpc('registrar_ciencia_ocorrencia', { p_id: data.id })).error).not.toBeNull();
    expect((await gestaoB.client.rpc('registrar_ciencia_ocorrencia', { p_id: data.id })).error).not.toBeNull();
    expect((await familia.client.rpc('registrar_ciencia_ocorrencia', { p_id: data.id })).error).toBeNull();
    const { data: lido } = await adminClient.from('student_incidents').select('ciencia_em, ciencia_por').eq('id', data.id).single();
    expect(lido.ciencia_em).not.toBeNull();
    expect(lido.ciencia_por).toBe(familia.id);

    const interna = (await registrar(prof)).data.id;
    expect((await familia.client.rpc('registrar_ciencia_ocorrencia', { p_id: interna })).error).not.toBeNull();
  });

  it('ninguém consegue forjar a ciência por update direto', async () => {
    const { data } = await registrar(prof, { visivel_familia: true, exige_ciencia: true });
    await gestao.client.from('student_incidents').update({ ciencia_em: new Date().toISOString(), ciencia_por: gestao.id }).eq('id', data.id);
    const { data: lido } = await adminClient.from('student_incidents').select('ciencia_em').eq('id', data.id).single();
    expect(lido.ciencia_em).toBeNull();
  });

  it('ninguém apaga ocorrência', async () => {
    const { data } = await registrar(prof);
    for (const u of [prof, gestao, coord]) await u.client.from('student_incidents').delete().eq('id', data.id);
    const { data: lido } = await adminClient.from('student_incidents').select('id').eq('id', data.id);
    expect(lido).toHaveLength(1);
  });

  it('aluno de outra escola é barrado', async () => {
    expect((await gestao.client.from('student_incidents').insert(base(escolaA, alunoB, gestao.id))).error).not.toBeNull();
  });

  it('com o módulo desligado ninguém lê nem registra', async () => {
    const { data } = await registrar(prof);
    await adminClient.from('schools').update({ features_enabled: { ocorrencias: false } }).eq('id', escolaA);
    try {
      expect((await gestao.client.from('student_incidents').select('id').eq('id', data.id)).data).toHaveLength(0);
      expect((await registrar(prof)).error).not.toBeNull();
      expect((await familia.client.rpc('ocorrencias_minhas')).data ?? []).toHaveLength(0);
    } finally {
      await adminClient.from('schools').update({ features_enabled: { ocorrencias: true } }).eq('id', escolaA);
    }
  });

  it('alertas de saúde só para quem atende o aluno', async () => {
    await adminClient.from('fichas_medicas').insert({ school_id: escolaA, student_id: alunoNido, tem_restricao_saude: true, restricoes_saude: ['Asma'] });
    const ok = await prof.client.rpc('ocorrencias_alertas_saude', { p_student_id: alunoNido });
    expect(ok.data?.[0]?.restricoes_saude).toContain('Asma');
    expect((await profOutra.client.rpc('ocorrencias_alertas_saude', { p_student_id: alunoNido })).data ?? []).toHaveLength(0);
    expect((await familia.client.rpc('ocorrencias_alertas_saude', { p_student_id: alunoNido })).data ?? []).toHaveLength(0);
    await adminClient.from('fichas_medicas').delete().eq('student_id', alunoNido);
  });
});
