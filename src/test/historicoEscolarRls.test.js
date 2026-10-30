import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Histórico escolar e declarações (PLANO_EXPANSAO_GESTAO.md, item 12): quem emite, isolamento entre
// escolas, número sequencial, escrita só pelas funções e verificação pública sem dado do aluno.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('historico escolar (RLS e funções)', () => {
  let schoolA, schoolB, gestao, coordenacao, recepcao, familia, gestaoB, aluno;

  beforeAll(async () => {
    schoolA = await createTestSchool();
    schoolB = await createTestSchool();
    await adminClient.from('schools').update({ features_enabled: { historico_escolar: true } }).eq('id', schoolA);
    gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
    coordenacao = await createTestUser({ role: 'gestao_pedagogica', schoolId: schoolA });
    recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
    familia = await createTestUser({ role: 'family', schoolId: schoolA });
    gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });
    await adminClient.from('schools').update({ features_enabled: { historico_escolar: true } }).eq('id', schoolB);
    const { data, error } = await adminClient.from('students')
      .insert({ school_id: schoolA, name: 'Vitest Aluno Historico', family_id: familia.id }).select('id').single();
    if (error) throw error;
    aluno = data;
  });

  afterAll(async () => {
    await adminClient.from('school_documents_issued').delete().eq('school_id', schoolA);
    await adminClient.from('school_document_counters').delete().eq('school_id', schoolA);
    await adminClient.from('student_external_history').delete().eq('school_id', schoolA);
    await adminClient.from('school_role_permissions').delete().eq('school_id', schoolA);
    await adminClient.from('students').delete().eq('school_id', schoolA);
    for (const u of [gestao, coordenacao, recepcao, familia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  });

  const emitir = (u, tipo = 'historico') => u.client.rpc('documentos_emitir', {
    p_student: aluno.id, p_tipo: tipo, p_conteudo: { versao: 1, titulo: 'Teste', aluno: { nome: 'Vitest' } },
  });

  it('Gestão emite, com número sequencial por escola e código de 16 caracteres', async () => {
    const a = await emitir(gestao);
    expect(a.error).toBeNull();
    expect(a.data[0].numero).toBe(1);
    expect(a.data[0].codigo_verificacao).toMatch(/^[0-9A-F]{16}$/);
    expect(a.data[0].hash_conteudo).toMatch(/^[0-9a-f]{64}$/);
    const b = await emitir(gestao, 'declaracao_matricula');
    expect(b.data[0].numero).toBe(2);
  });

  it('emissões ao mesmo tempo não repetem número', async () => {
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => emitir(coordenacao)));
    expect(rs.every(r => !r.error)).toBe(true);
    const numeros = rs.map(r => r.data[0].numero);
    expect(new Set(numeros).size).toBe(5);
  });

  it('Recepção só emite com a permissão historico.emitir', async () => {
    expect((await emitir(recepcao)).error).not.toBeNull();
    await adminClient.from('school_role_permissions')
      .insert({ school_id: schoolA, role: 'admin', permission: 'historico.emitir', granted: true });
    expect((await emitir(recepcao)).error).toBeNull();
  });

  it('família não emite, não lê documento nem anos cursados fora', async () => {
    expect((await emitir(familia)).error).not.toBeNull();
    const docs = await familia.client.from('school_documents_issued').select('id').limit(5);
    expect(docs.data ?? []).toHaveLength(0);
    const ext = await familia.client.from('student_external_history').select('id').limit(5);
    expect(ext.data ?? []).toHaveLength(0);
  });

  it('Gestão de outra escola não emite para o aluno nem lê os documentos', async () => {
    expect((await emitir(gestaoB)).error).not.toBeNull();
    const docs = await gestaoB.client.from('school_documents_issued').select('id').limit(5);
    expect(docs.data ?? []).toHaveLength(0);
    const ins = await gestaoB.client.from('student_external_history').insert({
      school_id: schoolB, student_id: aluno.id, escola_origem: 'X', ano_letivo: 2020, serie: '1', resultado: 'aprovado',
    });
    expect(ins.error).not.toBeNull();
  });

  it('não existe escrita direta em documentos emitidos', async () => {
    const ins = await gestao.client.from('school_documents_issued').insert({
      school_id: schoolA, student_id: aluno.id, tipo: 'historico', numero: 999, codigo_verificacao: 'ABCDEF0123456789', conteudo: {}, hash_conteudo: 'x',
    });
    expect(ins.error).not.toBeNull();
    const { data: lista } = await gestao.client.from('school_documents_issued').select('id').limit(1);
    const upd = await gestao.client.from('school_documents_issued').update({ cancelado_em: new Date().toISOString() }).eq('id', lista[0].id).select('id');
    expect(upd.data ?? []).toHaveLength(0);
  });

  it('Gestão lança anos cursados fora e a Coordenação também lê', async () => {
    const ins = await gestao.client.from('student_external_history').insert({
      school_id: schoolA, student_id: aluno.id, escola_origem: 'Escola X', ano_letivo: 2022, serie: '5º ano',
      disciplinas: [{ nome: 'Arte', nota: '9' }], resultado: 'aprovado',
    });
    expect(ins.error).toBeNull();
    const lido = await coordenacao.client.from('student_external_history').select('id').eq('school_id', schoolA).limit(5);
    expect(lido.data.length).toBeGreaterThan(0);
  });

  it('módulo desligado bloqueia emissão', async () => {
    await adminClient.from('schools').update({ features_enabled: { historico_escolar: false } }).eq('id', schoolA);
    expect((await emitir(gestao)).error).not.toBeNull();
    await adminClient.from('schools').update({ features_enabled: { historico_escolar: true } }).eq('id', schoolA);
  });

  it('verificação pública só roda com a chave de serviço e não devolve dado do aluno', async () => {
    const r = await emitir(gestao);
    const codigo = r.data[0].codigo_verificacao;
    const comUsuario = await gestao.client.rpc('documentos_verificar', { p_codigo: codigo });
    expect(comUsuario.error).not.toBeNull();
    const ok = await adminClient.rpc('documentos_verificar', { p_codigo: codigo.toLowerCase() });
    expect(ok.error).toBeNull();
    expect(Object.keys(ok.data[0]).sort()).toEqual(['emitido_em', 'escola', 'situacao', 'tipo']);
    expect(ok.data[0].situacao).toBe('valido');
    expect(JSON.stringify(ok.data)).not.toContain('Vitest Aluno');
    const nada = await adminClient.rpc('documentos_verificar', { p_codigo: '0000000000000000' });
    expect(nada.data).toHaveLength(0);
  });

  it('cancelar exige motivo, só vale na própria escola e aparece como cancelado na verificação', async () => {
    const r = await emitir(gestao);
    const { id, codigo_verificacao: codigo } = r.data[0];
    expect((await gestaoB.client.rpc('documentos_cancelar', { p_document: id, p_motivo: 'Teste de outra escola' })).error).not.toBeNull();
    expect((await gestao.client.rpc('documentos_cancelar', { p_document: id, p_motivo: '' })).error).not.toBeNull();
    expect((await gestao.client.rpc('documentos_cancelar', { p_document: id, p_motivo: 'Dados errados' })).error).toBeNull();
    expect((await gestao.client.rpc('documentos_cancelar', { p_document: id, p_motivo: 'De novo' })).error).not.toBeNull();
    const v = await adminClient.rpc('documentos_verificar', { p_codigo: codigo });
    expect(v.data[0].situacao).toBe('cancelado');
  });
});
