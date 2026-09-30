import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Dados legais da escola (migração 20260930124817): razão social, CNPJ,
// inscrição municipal, e-mail oficial e encarregado de dados só a Gestão e o
// suporte alteram; o responsável legal (com CPF) fica numa tabela que só a
// Gestão, o suporte e quem gera contrato leem. Famílias, professoras,
// Coordenação e Recepção sem permissão não enxergam o CPF.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

runIf('Dados legais da escola', () => {
  const ctx = { contas: [] };
  const nova = async (role, schoolId, extra = {}) => {
    const c = await createTestUser({ role, schoolId, extra });
    ctx.contas.push(c.id);
    return c;
  };

  beforeAll(async () => {
    ctx.schoolId = await createTestSchool('Vitest Dados Legais');
    ctx.outraEscola = await createTestSchool('Vitest Dados Legais Outra');
    ctx.gestao = await nova('gestao', ctx.schoolId);
    ctx.recepcao = await nova('admin', ctx.schoolId, { departamento: 'recepcao' });
    ctx.coord = await nova('gestao_pedagogica', ctx.schoolId, { departamento: 'coordenacao' });
    ctx.familia = await nova('family', ctx.schoolId);
    ctx.professora = await nova('teacher', ctx.schoolId);
    ctx.gestaoDeFora = await nova('gestao', ctx.outraEscola);
  }, 60000);

  afterAll(async () => {
    await adminClient.from('school_role_permissions').delete().eq('school_id', ctx.schoolId);
    for (const id of ctx.contas) await deleteTestUser(id);
    await deleteTestSchool(ctx.schoolId);
    await deleteTestSchool(ctx.outraEscola);
  }, 60000);

  const escola = async () => (await adminClient.from('schools')
    .select('name, razao_social, cnpj, inscricao_municipal, email, phone, encarregado_dados_nome, encarregado_dados_email').eq('id', ctx.schoolId).single()).data;

  it('a Gestão preenche razão social, CNPJ, inscrição municipal, e-mail e encarregado de dados', async () => {
    const dados = {
      razao_social: 'Vitest Educacao Infantil LTDA', cnpj: '11.222.333/0001-81', inscricao_municipal: '123456',
      email: 'contato@vitest.com', encarregado_dados_nome: 'Maria Encarregada', encarregado_dados_email: 'lgpd@vitest.com',
    };
    const { error } = await ctx.gestao.client.from('schools').update(dados).eq('id', ctx.schoolId);
    expect(error).toBeNull();
    expect(await escola()).toMatchObject(dados);
  }, 30000);

  it('a Recepção continua editando nome fantasia e telefone, mas não os dados legais', async () => {
    const { error: comum } = await ctx.recepcao.client.from('schools').update({ name: 'Vitest Escolinha', phone: '27 3333 4444' }).eq('id', ctx.schoolId);
    expect(comum).toBeNull();
    for (const [campo, valor] of [['razao_social', 'Outra LTDA'], ['cnpj', '00.000.000/0000-00'], ['inscricao_municipal', '999'], ['email', 'x@x.com'], ['encarregado_dados_email', 'x@x.com']]) {
      const { error } = await ctx.recepcao.client.from('schools').update({ [campo]: valor }).eq('id', ctx.schoolId);
      expect(error, campo).toBeTruthy();
    }
    expect(await escola()).toMatchObject({ name: 'Vitest Escolinha', phone: '27 3333 4444', razao_social: 'Vitest Educacao Infantil LTDA', cnpj: '11.222.333/0001-81' });
  }, 30000);

  it('a Coordenação não altera dados legais', async () => {
    await ctx.coord.client.from('schools').update({ razao_social: 'Coord LTDA' }).eq('id', ctx.schoolId);
    expect((await escola()).razao_social).toBe('Vitest Educacao Infantil LTDA');
  }, 30000);

  it('código do IBGE só aceita 7 números', async () => {
    const { error: ruim } = await ctx.gestao.client.from('schools').update({ codigo_ibge: '32' }).eq('id', ctx.schoolId);
    expect(ruim).toBeTruthy();
    const { error: bom } = await ctx.gestao.client.from('schools').update({ codigo_ibge: '3205309' }).eq('id', ctx.schoolId);
    expect(bom).toBeNull();
  }, 30000);

  it('responsável legal: a Gestão grava e o CPF fica só com números', async () => {
    const { error } = await ctx.gestao.client.from('escola_responsavel_legal')
      .upsert({ school_id: ctx.schoolId, nome: 'Ana Responsável', cpf: '529.982.247-25', cargo: 'Sócia administradora' });
    expect(error).toBeNull();
    const { data } = await ctx.gestao.client.from('escola_responsavel_legal').select('nome, cpf, cargo, atualizado_por').eq('school_id', ctx.schoolId).single();
    expect(data).toEqual({ nome: 'Ana Responsável', cpf: '52998224725', cargo: 'Sócia administradora', atualizado_por: ctx.gestao.id });
  }, 30000);

  it('ninguém de fora da Gestão lê o CPF do responsável legal (família, professora, Coordenação, Recepção sem permissão, outra escola)', async () => {
    for (const [quem, conta] of [['família', ctx.familia], ['professora', ctx.professora], ['coordenação', ctx.coord], ['recepção', ctx.recepcao], ['outra escola', ctx.gestaoDeFora]]) {
      const { data } = await conta.client.from('escola_responsavel_legal').select('cpf').eq('school_id', ctx.schoolId);
      expect(data ?? [], quem).toEqual([]);
    }
  }, 30000);

  it('ninguém além da Gestão grava o responsável legal', async () => {
    for (const conta of [ctx.recepcao, ctx.coord, ctx.familia, ctx.gestaoDeFora]) {
      await conta.client.from('escola_responsavel_legal').upsert({ school_id: ctx.schoolId, nome: 'Trocado', cpf: '', cargo: '' });
      await conta.client.from('escola_responsavel_legal').delete().eq('school_id', ctx.schoolId);
    }
    const { data } = await adminClient.from('escola_responsavel_legal').select('nome').eq('school_id', ctx.schoolId).single();
    expect(data.nome).toBe('Ana Responsável');
  }, 30000);

  it('a Recepção com permissão de gerar contrato lê o responsável legal (precisa para montar o contrato)', async () => {
    const { error } = await adminClient.from('school_role_permissions')
      .insert({ school_id: ctx.schoolId, role: 'admin', permission: 'contratos.gerenciar', granted: true });
    expect(error).toBeNull();
    const { data } = await ctx.recepcao.client.from('escola_responsavel_legal').select('nome, cpf').eq('school_id', ctx.schoolId);
    expect(data).toEqual([{ nome: 'Ana Responsável', cpf: '52998224725' }]);
  }, 30000);
});
