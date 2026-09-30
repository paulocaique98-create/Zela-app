import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY, hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Contas vinculadas (migração 20260929233347_contas_vinculadas.sql e funções
// vincular-conta / trocar-conta). Contas reais no banco local, logadas de
// verdade. Garantias:
//   1. só vincula quem prova ser dono das duas contas (senha da outra);
//   2. troca sem senha SÓ para conta do próprio grupo, ativa;
//   3. ninguém lê nem grava os vínculos direto;
//   4. o vínculo cai quando a conta é excluída ou o e-mail de login muda.
const runIf = hasIntegrationCredentials ? describe : describe.skip;
const SENHA = 'SenhaTeste123!';

async function chamarFuncao(nome, token, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function grupoDe(userId) {
  const { data } = await adminClient.from('contas_vinculadas').select('grupo').eq('user_id', userId).maybeSingle();
  return data?.grupo ?? null;
}

runIf('Contas vinculadas · troca entre contas da mesma pessoa', () => {
  const ctx = { contas: [] };
  const nova = async (role, extra = {}) => {
    const conta = await createTestUser({ role, schoolId: ctx.schoolId, extra });
    ctx.contas.push(conta.id);
    return conta;
  };

  beforeAll(async () => {
    ctx.schoolId = await createTestSchool('Vitest Contas Vinculadas');
    ctx.coord = await nova('gestao_pedagogica', { departamento: 'coordenacao' });
    ctx.mae = await nova('family');
    ctx.estranha = await nova('family');
    const { data: aluno } = await adminClient.from('students')
      .insert({ name: 'Maitê Vitest Santana', school_id: ctx.schoolId, family_id: ctx.mae.id, enrollment_status: 'ativo' })
      .select('id').single();
    ctx.alunoId = aluno.id;
    await adminClient.from('notifications').insert([
      { school_id: ctx.schoolId, family_id: ctx.mae.id, type: 'geral', message: 'Aviso Vitest 1' },
      { school_id: ctx.schoolId, family_id: ctx.mae.id, type: 'geral', message: 'Aviso Vitest 2' },
    ]);
  }, 60000);

  afterAll(async () => {
    await adminClient.from('notifications').delete().in('family_id', ctx.contas);
    if (ctx.alunoId) await adminClient.from('students').delete().eq('id', ctx.alunoId);
    for (const id of ctx.contas) await deleteTestUser(id);
    await deleteTestSchool(ctx.schoolId);
  }, 60000);

  it('senha errada não vincula; a própria conta também não', async () => {
    const errada = await chamarFuncao('vincular-conta', ctx.coord.token, { email: ctx.mae.email, password: 'errada' });
    expect(errada.status).toBe(400);
    expect(errada.body.error).toBe('E-mail ou senha incorretos.');
    const propria = await chamarFuncao('vincular-conta', ctx.coord.token, { email: ctx.coord.email, password: SENHA });
    expect(propria.status).toBe(400);
    expect(await grupoDe(ctx.coord.id)).toBeNull();
  }, 30000);

  it('com a senha da outra conta vincula, e as duas se enxergam com filhos e avisos', async () => {
    const ok = await chamarFuncao('vincular-conta', ctx.coord.token, { email: ctx.mae.email, password: SENHA });
    expect(ok.status).toBe(200);
    expect(ok.body.conta).toMatchObject({ id: ctx.mae.id, role: 'family' });
    expect(await grupoDe(ctx.coord.id)).toBe(await grupoDe(ctx.mae.id));
    // Conferir a senha não derruba a outra conta nos aparelhos dela.
    const { error: maeSegueLogada } = await ctx.mae.authClient.auth.getUser();
    expect(maeSegueLogada).toBeNull();
    expect((await chamarFuncao('trocar-conta', ctx.mae.token, { user_id: ctx.coord.id })).status).toBe(200);

    const { data: pelaCoord, error } = await ctx.coord.client.rpc('listar_contas_vinculadas');
    expect(error).toBeNull();
    expect(pelaCoord).toHaveLength(2);
    const atual = pelaCoord.find(c => c.atual);
    const mae = pelaCoord.find(c => !c.atual);
    expect(atual.user_id).toBe(ctx.coord.id);
    expect(mae).toMatchObject({ user_id: ctx.mae.id, role: 'family', alunos: ['Maitê'], nao_lidas: 2 });

    const { data: pelaMae } = await ctx.mae.client.rpc('listar_contas_vinculadas');
    expect(pelaMae.map(c => c.user_id).sort()).toEqual([ctx.coord.id, ctx.mae.id].sort());

    const { data: pelaEstranha } = await ctx.estranha.client.rpc('listar_contas_vinculadas');
    expect(pelaEstranha).toEqual([]);
  }, 30000);

  it('troca sem senha abre a outra conta de verdade', async () => {
    const troca = await chamarFuncao('trocar-conta', ctx.coord.token, { user_id: ctx.mae.id });
    expect(troca.status).toBe(200);
    expect(troca.body.token_hash).toBeTruthy();

    const navegador = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await navegador.auth.verifyOtp({ token_hash: troca.body.token_hash, type: 'magiclink' });
    expect(error).toBeNull();
    expect(data.user.id).toBe(ctx.mae.id);
    const { data: eu } = await navegador.from('users').select('id, role').eq('id', data.user.id).single();
    expect(eu).toMatchObject({ id: ctx.mae.id, role: 'family' });

    // O código vale uma vez só.
    const denovo = await createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
      .auth.verifyOtp({ token_hash: troca.body.token_hash, type: 'magiclink' });
    expect(denovo.error).toBeTruthy();
  }, 30000);

  it('não troca para conta fora do grupo, nem sem login', async () => {
    const fora = await chamarFuncao('trocar-conta', ctx.coord.token, { user_id: ctx.estranha.id });
    expect(fora.status).toBe(403);
    const daEstranha = await chamarFuncao('trocar-conta', ctx.estranha.token, { user_id: ctx.mae.id });
    expect(daEstranha.status).toBe(403);
    const semLogin = await chamarFuncao('trocar-conta', ANON_KEY, { user_id: ctx.mae.id });
    expect([401, 403]).toContain(semLogin.status);
  }, 30000);

  it('ninguém lê nem grava os vínculos direto, nem chama as funções internas', async () => {
    const { data: lidos } = await ctx.coord.client.from('contas_vinculadas').select('*');
    expect(lidos ?? []).toEqual([]);
    const { error: gravar } = await ctx.estranha.client.from('contas_vinculadas')
      .insert({ user_id: ctx.estranha.id, grupo: await grupoDe(ctx.mae.id) });
    expect(gravar).toBeTruthy();
    const { error: vincular } = await ctx.estranha.client.rpc('vincular_contas', { p_a: ctx.estranha.id, p_b: ctx.mae.id });
    expect(vincular).toBeTruthy();
    const { error: conferir } = await ctx.estranha.client.rpc('conta_vinculada_ativa', { p_origem: ctx.estranha.id, p_destino: ctx.mae.id });
    expect(conferir).toBeTruthy();
    const { error: desvincular } = await ctx.estranha.client.rpc('desvincular_conta', { p_user_id: ctx.mae.id });
    expect(desvincular).toBeTruthy();
    expect(await grupoDe(ctx.estranha.id)).toBeNull();
    expect(await grupoDe(ctx.mae.id)).not.toBeNull();
  }, 30000);

  it('conta inativa não recebe troca; o suporte não vincula', async () => {
    const prof = await nova('teacher', { teacher_status: 'bloqueado' });
    const bloqueada = await chamarFuncao('vincular-conta', ctx.coord.token, { email: prof.email, password: SENHA });
    expect(bloqueada.status).toBe(400);
    const dev = await createTestUser({ role: 'developer' });
    ctx.contas.push(dev.id);
    const doSuporte = await chamarFuncao('vincular-conta', dev.token, { email: ctx.estranha.email, password: SENHA });
    expect(doSuporte.status).toBe(400);

    // Conta vinculada que ficou pendente some da lista e não recebe troca.
    await adminClient.from('users').update({ status: 'pending' }).eq('id', ctx.mae.id);
    const troca = await chamarFuncao('trocar-conta', ctx.coord.token, { user_id: ctx.mae.id });
    expect(troca.status).toBe(403);
    const { data: lista } = await ctx.coord.client.rpc('listar_contas_vinculadas');
    expect(lista.map(c => c.user_id)).toEqual([ctx.coord.id]);
    await adminClient.from('users').update({ status: 'active' }).eq('id', ctx.mae.id);
  }, 30000);

  it('e-mail de login trocado derruba o vínculo (quem trocou não herda a outra conta)', async () => {
    expect(await grupoDe(ctx.mae.id)).not.toBeNull();
    const novoEmail = `vitest.trocado.${Date.now()}@zela-teste.com`;
    const { error } = await adminClient.auth.admin.updateUserById(ctx.mae.id, { email: novoEmail, email_confirm: true });
    expect(error).toBeNull();
    expect(await grupoDe(ctx.mae.id)).toBeNull();
    // O grupo que ficou com uma conta só também some.
    expect(await grupoDe(ctx.coord.id)).toBeNull();
    const troca = await chamarFuncao('trocar-conta', ctx.coord.token, { user_id: ctx.mae.id });
    expect(troca.status).toBe(403);
    await adminClient.from('users').update({ email: novoEmail }).eq('id', ctx.mae.id);
    ctx.mae.email = novoEmail;
  }, 30000);

  it('conta excluída (funcionária desligada) sai do grupo; desvincular pela tela funciona', async () => {
    const terceira = await nova('family');
    // Agora pela conta da mãe (a da Coordenação já gastou tentativas acima).
    for (const outra of [ctx.coord, terceira]) {
      const r = await chamarFuncao('vincular-conta', ctx.mae.token, { email: outra.email, password: SENHA });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
    const grupo = await grupoDe(ctx.coord.id);
    expect(await grupoDe(ctx.mae.id)).toBe(grupo);
    expect(await grupoDe(terceira.id)).toBe(grupo);

    // Desligamento: a conta da Coordenação é excluída; mãe e terceira seguem juntas.
    await deleteTestUser(ctx.coord.id);
    expect(await grupoDe(ctx.coord.id)).toBeNull();
    expect(await grupoDe(ctx.mae.id)).toBe(grupo);

    // A mãe desvincula a terceira: o grupo fica com uma conta só e some.
    const { error } = await ctx.mae.client.rpc('desvincular_conta', { p_user_id: terceira.id });
    expect(error).toBeNull();
    expect(await grupoDe(terceira.id)).toBeNull();
    expect(await grupoDe(ctx.mae.id)).toBeNull();
  }, 60000);

  it('tentativas de senha têm limite (5 a cada 10 minutos)', async () => {
    const alvo = await nova('family');
    const tentativas = [];
    for (let i = 0; i < 6; i++) {
      tentativas.push((await chamarFuncao('vincular-conta', ctx.estranha.token, { email: alvo.email, password: `errada${i}` })).status);
    }
    expect(tentativas.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(tentativas[5]).toBe(429);
    // Nem com a senha certa passa enquanto o limite vale.
    const certa = await chamarFuncao('vincular-conta', ctx.estranha.token, { email: alvo.email, password: SENHA });
    expect(certa.status).toBe(429);
    expect(await grupoDe(alvo.id)).toBeNull();
  }, 60000);
});
