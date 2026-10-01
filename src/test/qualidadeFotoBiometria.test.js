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
