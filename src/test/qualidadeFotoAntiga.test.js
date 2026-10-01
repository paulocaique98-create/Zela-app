import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Qualidade da foto antiga não vale para biometria nova (01/10/2026): ao
// retirar a biometria, ou trocar sem medição nova no mesmo UPDATE (versão
// antiga do app), a pessoa volta para "Sem análise". O cadastro atual, que
// grava descritor e qualidade juntos, e a análise da Gestão, que só grava a
// qualidade, continuam como sempre.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Qualidade da foto · biometria retirada ou trocada volta para Sem análise', () => {
  const ctx = {};
  const medicao = (rosto) => ({ largura_px: 1080, altura_px: 1920, rosto_px: rosto, brilho: 120, nitidez: 90, avaliado_em: new Date().toISOString(), origem: 'cadastro' });
  const ler = async () => (await adminClient.from('authorized_persons').select('foto_qualidade').eq('id', ctx.pessoaId).single()).data.foto_qualidade;

  beforeAll(async () => {
    ctx.escola = await createTestSchool('Vitest Qualidade Antiga');
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.escola });
    const { data } = await adminClient.from('authorized_persons')
      .insert({ name: 'Vitest Tia', school_id: ctx.escola, family_id: ctx.familia.id, relation: 'Tia', face_descriptor: '[0.1,0.2]', has_photo: true, foto_qualidade: medicao(400) })
      .select('id').single();
    ctx.pessoaId = data.id;
  }, 60000);

  afterAll(async () => {
    await adminClient.from('authorized_persons').delete().eq('id', ctx.pessoaId);
    await deleteTestUser(ctx.familia.id);
    await deleteTestSchool(ctx.escola);
  }, 60000);

  it('cadastro atual (descritor e qualidade juntos) guarda a medição nova', async () => {
    const nova = medicao(520);
    const { error } = await ctx.familia.client.from('authorized_persons')
      .update({ face_descriptor: '[0.3,0.4]', foto_qualidade: nova }).eq('id', ctx.pessoaId);
    expect(error).toBeNull();
    expect(await ler()).toEqual(nova);
  }, 30000);

  it('análise da Gestão (só a qualidade) não é apagada', async () => {
    const analise = { ...medicao(500), origem: 'analise' };
    await adminClient.from('authorized_persons').update({ foto_qualidade: analise }).eq('id', ctx.pessoaId);
    expect(await ler()).toEqual(analise);
  }, 30000);

  it('troca de biometria sem medição nova (app antigo): volta para Sem análise', async () => {
    const { error } = await ctx.familia.client.from('authorized_persons')
      .update({ face_descriptor: '[0.7,0.8]', has_photo: true }).eq('id', ctx.pessoaId);
    expect(error).toBeNull();
    expect(await ler()).toBeNull();
  }, 30000);

  it('biometria retirada: volta para Sem análise', async () => {
    await adminClient.from('authorized_persons').update({ foto_qualidade: medicao(450) }).eq('id', ctx.pessoaId);
    const { error } = await ctx.familia.client.from('authorized_persons')
      .update({ face_descriptor: null, has_photo: false, photo_storage_path: null }).eq('id', ctx.pessoaId);
    expect(error).toBeNull();
    expect(await ler()).toBeNull();
  }, 30000);
});
