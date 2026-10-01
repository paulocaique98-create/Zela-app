import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Cadastro de biometria (01/10/2026): grava o descritor do motor atual, o do
// Human gerado ao vivo (GENERATED_LIVE) e os números de qualidade da foto,
// com as mesmas permissões de sempre (família no próprio autorizado; outra
// família não mexe).
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Qualidade da foto de biometria', () => {
  const ctx = { contas: [] };

  beforeAll(async () => {
    ctx.escola = await createTestSchool('Vitest Qualidade Foto');
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.escola });
    ctx.outra = await createTestUser({ role: 'family', schoolId: ctx.escola });
    ctx.contas.push(ctx.familia.id, ctx.outra.id);
    const { data } = await adminClient.from('authorized_persons')
      .insert({ name: 'Vitest Avó', school_id: ctx.escola, family_id: ctx.familia.id, relation: 'Avó', face_descriptor_v2: '[0.1,0.2]', face_descriptor_v2_status: 'GENERATED' })
      .select('id').single();
    ctx.pessoaId = data.id;
  }, 60000);

  afterAll(async () => {
    await adminClient.from('authorized_persons').delete().eq('id', ctx.pessoaId);
    for (const id of ctx.contas) await deleteTestUser(id);
    await deleteTestSchool(ctx.escola);
  }, 60000);

  const qualidade = { largura_px: 1920, altura_px: 1080, rosto_px: 410, brilho: 132, nitidez: 86.4, avaliado_em: '2026-10-01T12:00:00Z', origem: 'cadastro' };

  it('a família refaz a biometria: grava descritor ao vivo do Human e a qualidade', async () => {
    const { error } = await ctx.familia.client.from('authorized_persons').update({
      has_photo: true, face_descriptor: JSON.stringify([0.5, 0.5]),
      face_descriptor_v2: JSON.stringify([0.6, 0.8]), face_descriptor_v2_status: 'GENERATED_LIVE', foto_qualidade: qualidade,
    }).eq('id', ctx.pessoaId);
    expect(error).toBeNull();
    const { data } = await adminClient.from('authorized_persons').select('face_descriptor_v2, face_descriptor_v2_status, foto_qualidade').eq('id', ctx.pessoaId).single();
    expect(data).toEqual({ face_descriptor_v2: '[0.6,0.8]', face_descriptor_v2_status: 'GENERATED_LIVE', foto_qualidade: qualidade });
  }, 30000);

  it('sem descritor ao vivo, o v2 antigo é descartado (nunca fica o da foto anterior)', async () => {
    const { error } = await ctx.familia.client.from('authorized_persons').update({
      face_descriptor_v2: null, face_descriptor_v2_status: 'PENDING',
    }).eq('id', ctx.pessoaId);
    expect(error).toBeNull();
    const { data } = await adminClient.from('authorized_persons').select('face_descriptor_v2, face_descriptor_v2_status').eq('id', ctx.pessoaId).single();
    expect(data).toEqual({ face_descriptor_v2: null, face_descriptor_v2_status: 'PENDING' });
  }, 30000);

  it('outra família não grava qualidade nem descritor de quem não é dela', async () => {
    await ctx.outra.client.from('authorized_persons').update({ foto_qualidade: { brilho: 1 } }).eq('id', ctx.pessoaId);
    const { data } = await adminClient.from('authorized_persons').select('foto_qualidade').eq('id', ctx.pessoaId).single();
    expect(data.foto_qualidade).toEqual(qualidade);
  }, 30000);
});

runIf('Qualidade da biometria · ferramenta da Gestão e visão do suporte', () => {
  const ctx = { contas: [] };
  const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

  beforeAll(async () => {
    ctx.escola = await createTestSchool('Vitest Qualidade Gestao');
    ctx.outraEscola = await createTestSchool('Vitest Qualidade Outra');
    ctx.gestao = await createTestUser({ role: 'gestao', schoolId: ctx.escola });
    ctx.gestaoDeFora = await createTestUser({ role: 'gestao', schoolId: ctx.outraEscola });
    ctx.dev = await createTestUser({ role: 'developer' });
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.escola });
    ctx.contas.push(ctx.gestao.id, ctx.gestaoDeFora.id, ctx.dev.id, ctx.familia.id);
    const { data } = await adminClient.from('authorized_persons')
      .insert({ name: 'Vitest Tio', school_id: ctx.escola, family_id: ctx.familia.id, relation: 'Tio', face_descriptor: '[0.1,0.2]' })
      .select('id').single();
    ctx.pessoaId = data.id;
    ctx.caminho = `${ctx.escola}/${ctx.pessoaId}.png`;
    const { error } = await adminClient.storage.from('person-photos').upload(ctx.caminho, PNG, { contentType: 'image/png', upsert: true });
    if (error) throw error;
    await adminClient.from('authorized_persons').update({ photo_storage_path: ctx.caminho, has_photo: true }).eq('id', ctx.pessoaId);
  }, 60000);

  afterAll(async () => {
    await adminClient.storage.from('person-photos').remove([ctx.caminho]);
    await adminClient.from('authorized_persons').delete().eq('id', ctx.pessoaId);
    for (const id of ctx.contas) await deleteTestUser(id);
    await deleteTestSchool(ctx.escola);
    await deleteTestSchool(ctx.outraEscola);
  }, 60000);

  const numeros = { largura_px: 1280, altura_px: 960, rosto_px: 95, brilho: 140, nitidez: 40.2, avaliado_em: '2026-10-01T15:00:00Z', origem: 'analise' };

  it('a Gestão abre a foto da própria escola e grava só os números', async () => {
    const { data: link, error: erroLink } = await ctx.gestao.client.storage.from('person-photos').createSignedUrl(ctx.caminho, 60);
    expect(erroLink).toBeNull();
    expect(link.signedUrl).toBeTruthy();
    const { error } = await ctx.gestao.client.from('authorized_persons').update({ foto_qualidade: numeros }).eq('id', ctx.pessoaId);
    expect(error).toBeNull();
    const { data } = await adminClient.from('authorized_persons').select('foto_qualidade').eq('id', ctx.pessoaId).single();
    expect(data.foto_qualidade).toEqual(numeros);
  }, 30000);

  it('a Gestão de outra escola não grava nem abre a foto', async () => {
    await ctx.gestaoDeFora.client.from('authorized_persons').update({ foto_qualidade: { brilho: 1 } }).eq('id', ctx.pessoaId);
    const { data } = await adminClient.from('authorized_persons').select('foto_qualidade').eq('id', ctx.pessoaId).single();
    expect(data.foto_qualidade).toEqual(numeros);
    const { data: link } = await ctx.gestaoDeFora.client.storage.from('person-photos').createSignedUrl(ctx.caminho, 60);
    expect(link?.signedUrl).toBeFalsy();
  }, 30000);

  it('o suporte (desenvolvedor) lê os números, mas não abre a foto (LGPD)', async () => {
    const { data, error } = await ctx.dev.client.from('authorized_persons').select('foto_qualidade').eq('id', ctx.pessoaId).single();
    expect(error).toBeNull();
    expect(data.foto_qualidade).toEqual(numeros);
    const { data: link } = await ctx.dev.client.storage.from('person-photos').createSignedUrl(ctx.caminho, 60);
    expect(link?.signedUrl).toBeFalsy();
  }, 30000);
});

