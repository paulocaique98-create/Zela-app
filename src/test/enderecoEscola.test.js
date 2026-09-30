import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';
import { montarEnderecoCompleto } from '../lib/cep.js';

// Endereço da escola por campos (migração 20260930114145): o banco monta o
// texto completo usado no contrato; as permissões seguem as da cidade.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Endereço da escola por campos', () => {
  const ctx = { contas: [] };

  beforeAll(async () => {
    ctx.schoolId = await createTestSchool('Vitest Endereco');
    ctx.gestao = await createTestUser({ role: 'gestao', schoolId: ctx.schoolId });
    ctx.coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: ctx.schoolId, extra: { departamento: 'coordenacao' } });
    ctx.contas.push(ctx.gestao.id, ctx.coord.id);
  }, 60000);

  afterAll(async () => {
    for (const id of ctx.contas) await deleteTestUser(id);
    await deleteTestSchool(ctx.schoolId);
  }, 60000);

  const ler = async () => (await adminClient.from('schools')
    .select('address, zip_code, street, number, complement, neighborhood, city, state').eq('id', ctx.schoolId).single()).data;

  it('a Gestão salva os campos e o endereço completo do contrato sai montado, igual ao da tela', async () => {
    const campos = { zip_code: '29056-250', street: 'Avenida Nossa Senhora da Penha', number: '1200', complement: 'Sala 3', neighborhood: 'Santa Lúcia', city: 'Vitória', state: 'ES' };
    const { error } = await ctx.gestao.client.from('schools').update(campos).eq('id', ctx.schoolId);
    expect(error).toBeNull();
    const escola = await ler();
    expect(escola).toMatchObject(campos);
    expect(escola.address).toBe('Avenida Nossa Senhora da Penha, 1200, Sala 3 · Santa Lúcia, Vitória/ES · CEP 29056-250');
    expect(escola.address).toBe(montarEnderecoCompleto({ rua: campos.street, numero: campos.number, complemento: campos.complement, bairro: campos.neighborhood, cidade: campos.city, uf: campos.state, cep: campos.zip_code }));
  }, 30000);

  it('mudar só o número atualiza o endereço completo', async () => {
    await ctx.gestao.client.from('schools').update({ number: '1300', complement: '' }).eq('id', ctx.schoolId);
    expect((await ler()).address).toBe('Avenida Nossa Senhora da Penha, 1300 · Santa Lúcia, Vitória/ES · CEP 29056-250');
  }, 30000);

  it('UF e CEP inválidos são recusados', async () => {
    const { error: uf } = await ctx.gestao.client.from('schools').update({ state: 'Espírito Santo' }).eq('id', ctx.schoolId);
    expect(uf).toBeTruthy();
    const { error: cep } = await ctx.gestao.client.from('schools').update({ zip_code: '123' }).eq('id', ctx.schoolId);
    expect(cep).toBeTruthy();
    expect((await ler()).state).toBe('ES');
  }, 30000);

  it('a Coordenação continua sem poder mudar o endereço da escola', async () => {
    await ctx.coord.client.from('schools').update({ street: 'Rua Trocada' }).eq('id', ctx.schoolId);
    expect((await ler()).street).toBe('Avenida Nossa Senhora da Penha');
  }, 30000);

  it('escola sem nenhum campo preenchido mantém o texto antigo', async () => {
    const outra = await createTestSchool('Vitest Endereco Antigo');
    try {
      await adminClient.from('schools').update({ address: 'Texto antigo, 10' }).eq('id', outra);
      await adminClient.from('schools').update({ city: 'Serra' }).eq('id', outra);
      const { data } = await adminClient.from('schools').select('address').eq('id', outra).single();
      expect(data.address).toBe('Texto antigo, 10');
    } finally {
      await deleteTestSchool(outra);
    }
  }, 30000);
});
