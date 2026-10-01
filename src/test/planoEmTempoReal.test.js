import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';
import { aplicarPacote } from '../lib/modulosCatalogo.js';

// Troca de plano chega às telas abertas (01/10/2026): o app escuta, em tempo
// real, a linha da própria escola (App.jsx > setupSecondaryRealtime). Aqui:
// uma conta da escola ouvindo recebe o plano novo; uma de outra escola não.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function ouvirEscola(conta, schoolId) {
  // No navegador o app entra no tempo real com o login da pessoa sozinho;
  // aqui, no Node, o token precisa ser passado explicitamente.
  await conta.authClient.realtime.setAuth(conta.token);
  const recebidos = [];
  const canal = conta.authClient
    .channel(`vitest-escola-${schoolId}-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'schools', filter: `id=eq.${schoolId}` }, (payload) => {
      recebidos.push(payload.new);
    });
  const pronto = new Promise((resolve, reject) => {
    canal.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
    });
  });
  return { canal, recebidos, pronto };
}

async function esperar(condicao, ms = 10000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (condicao()) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

runIf('Troca de plano em tempo real', () => {
  const ctx = { contas: [], canais: [] };

  beforeAll(async () => {
    ctx.escola = await createTestSchool('Vitest Plano Tempo Real');
    ctx.outra = await createTestSchool('Vitest Plano Outra');
    await adminClient.from('schools').update({ features_enabled: aplicarPacote({}, 'completo') }).eq('id', ctx.escola);
    ctx.familia = await createTestUser({ role: 'family', schoolId: ctx.escola });
    ctx.gestao = await createTestUser({ role: 'gestao', schoolId: ctx.escola });
    ctx.deFora = await createTestUser({ role: 'family', schoolId: ctx.outra });
    ctx.contas.push(ctx.familia.id, ctx.gestao.id, ctx.deFora.id);
  }, 60000);

  afterAll(async () => {
    for (const { conta, canal } of ctx.canais) await conta.authClient.removeChannel(canal).catch(() => {});
    for (const id of ctx.contas) await deleteTestUser(id);
    await deleteTestSchool(ctx.escola);
    await deleteTestSchool(ctx.outra);
  }, 60000);

  it('família e Gestão abertas recebem o plano novo; outra escola não recebe nada', async () => {
    const familia = await ouvirEscola(ctx.familia, ctx.escola);
    const gestao = await ouvirEscola(ctx.gestao, ctx.escola);
    const deFora = await ouvirEscola(ctx.deFora, ctx.escola);
    ctx.canais.push({ conta: ctx.familia, canal: familia.canal }, { conta: ctx.gestao, canal: gestao.canal }, { conta: ctx.deFora, canal: deFora.canal });
    await Promise.all([familia.pronto, gestao.pronto, deFora.pronto]);

    // O Portal do Dev troca para o Essencial. O canal recém aberto pode levar
    // um instante para começar a entregar (no app ele fica aberto o tempo
    // todo); por isso repete a gravação até o aviso chegar, por até 20 s.
    let chegou = false;
    for (let tentativa = 0; tentativa < 10 && !chegou; tentativa++) {
      const { error } = await adminClient.from('schools')
        .update({ features_enabled: aplicarPacote({}, 'essencial'), notes: `vitest ${tentativa}` }).eq('id', ctx.escola);
      expect(error).toBeNull();
      chegou = await esperar(() => familia.recebidos.length > 0 && gestao.recebidos.length > 0, 2000);
    }
    expect(chegou).toBe(true);
    for (const recebido of [familia.recebidos.at(-1), gestao.recebidos.at(-1)]) {
      expect(recebido.features_enabled.diario).toBe(false);
      expect(recebido.features_enabled.financeiro).toBe(true);
    }
    // Outra escola: a regra de leitura do banco não deixa o aviso chegar.
    await new Promise(r => setTimeout(r, 1500));
    expect(deFora.recebidos).toEqual([]);
  }, 60000);
});
