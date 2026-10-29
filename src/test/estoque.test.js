import { describe, it, expect } from 'vitest';
import { hasIntegrationCredentials } from './envForTests.js';
import { adminClient, createTestUser, deleteTestUser, createTestSchool, deleteTestSchool } from './supabaseTestHelpers.js';

// Estoque (PLANO_EXPANSAO_GESTAO.md, item 6): módulo desligado, RLS por escola e perfil,
// saldo pela view, saldo negativo barrado e histórico imutável.
const runIf = hasIntegrationCredentials ? describe : describe.skip;

async function montaCenario({ modulo = true } = {}) {
  const schoolA = await createTestSchool();
  const schoolB = await createTestSchool();
  if (modulo) {
    await adminClient.from('schools').update({ features_enabled: { estoque: true } }).in('id', [schoolA, schoolB]);
  }
  const gestao = await createTestUser({ role: 'gestao', schoolId: schoolA });
  const coord = await createTestUser({ role: 'gestao_pedagogica', schoolId: schoolA });
  const recepcao = await createTestUser({ role: 'admin', schoolId: schoolA });
  const prof = await createTestUser({ role: 'teacher', schoolId: schoolA });
  const familia = await createTestUser({ role: 'family', schoolId: schoolA });
  const gestaoB = await createTestUser({ role: 'gestao', schoolId: schoolB });

  const { data: item } = await adminClient.from('stock_items')
    .insert({ school_id: schoolA, nome: 'Vitest Papel A4', unidade: 'pct', estoque_minimo: 5 }).select('id').single();

  const limpar = async () => {
    await adminClient.from('stock_movements').delete().in('school_id', [schoolA, schoolB]);
    await adminClient.from('stock_items').delete().in('school_id', [schoolA, schoolB]);
    for (const u of [gestao, coord, recepcao, prof, familia, gestaoB]) await deleteTestUser(u.id);
    await deleteTestSchool(schoolA);
    await deleteTestSchool(schoolB);
  };
  return { schoolA, schoolB, gestao, coord, recepcao, prof, familia, gestaoB, item, limpar };
}

const registrar = (client, item, tipo, quantidade, motivo = null) =>
  client.rpc('estoque_registrar', { p_item_id: item, p_tipo: tipo, p_quantidade: quantidade, p_motivo: motivo });

runIf('Estoque · RLS e RPC', () => {
  it('só Gestão e Coordenação/Direção usam; Recepção, Professora e Família não', async () => {
    const c = await montaCenario();
    try {
      for (const u of [c.gestao, c.coord]) {
        const { data, error } = await u.client.from('stock_items').select('id');
        expect(error).toBeNull();
        expect(data.length).toBe(1);
      }
      for (const u of [c.recepcao, c.prof, c.familia]) {
        const { data } = await u.client.from('stock_items').select('id');
        expect(data).toEqual([]);
        const { error } = await registrar(u.client, c.item.id, 'entrada', 1);
        expect(error).not.toBeNull();
        const { error: ins } = await u.client.from('stock_items').insert({ school_id: c.schoolA, nome: 'Vitest Intruso' });
        expect(ins).not.toBeNull();
      }
    } finally { await c.limpar(); }
  });

  it('módulo desligado barra até a Gestão', async () => {
    const c = await montaCenario({ modulo: false });
    try {
      const { data } = await c.gestao.client.from('stock_items').select('id');
      expect(data).toEqual([]);
      const { error } = await registrar(c.gestao.client, c.item.id, 'entrada', 1);
      expect(error).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('saldo vem da view: entrada, saída e ajuste; saída maior que o saldo é barrada', async () => {
    const c = await montaCenario();
    try {
      expect((await registrar(c.gestao.client, c.item.id, 'entrada', 10)).error).toBeNull();
      expect((await registrar(c.coord.client, c.item.id, 'saida', 3.5, 'Sala 2')).error).toBeNull();
      expect((await registrar(c.gestao.client, c.item.id, 'ajuste', -1, 'Contagem')).error).toBeNull();
      const { data } = await c.gestao.client.from('stock_balances').select('saldo').eq('item_id', c.item.id).single();
      expect(Number(data.saldo)).toBe(5.5);

      const { error: muito } = await registrar(c.gestao.client, c.item.id, 'saida', 6);
      expect(muito?.message).toMatch(/Saldo insuficiente/);
      const { error: ajusteNeg } = await registrar(c.gestao.client, c.item.id, 'ajuste', -6, 'Perda');
      expect(ajusteNeg?.message).toMatch(/Saldo insuficiente/);
      const { data: depois } = await c.gestao.client.from('stock_balances').select('saldo').eq('item_id', c.item.id).single();
      expect(Number(depois.saldo)).toBe(5.5);
    } finally { await c.limpar(); }
  });

  it('valida quantidade, tipo e motivo do ajuste', async () => {
    const c = await montaCenario();
    try {
      expect((await registrar(c.gestao.client, c.item.id, 'entrada', 0)).error).not.toBeNull();
      expect((await registrar(c.gestao.client, c.item.id, 'entrada', -2)).error).not.toBeNull();
      expect((await registrar(c.gestao.client, c.item.id, 'ajuste', 2)).error?.message).toMatch(/motivo/);
      expect((await registrar(c.gestao.client, c.item.id, 'venda', 2)).error).not.toBeNull();
    } finally { await c.limpar(); }
  });

  it('movimento não se grava direto, não muda e não se apaga', async () => {
    const c = await montaCenario();
    try {
      const { data: id } = await registrar(c.gestao.client, c.item.id, 'entrada', 4);
      const { error: direto } = await c.gestao.client.from('stock_movements')
        .insert({ school_id: c.schoolA, item_id: c.item.id, tipo: 'entrada', quantidade: 100 });
      expect(direto).not.toBeNull();
      await c.gestao.client.from('stock_movements').update({ quantidade: 99 }).eq('id', id);
      await c.gestao.client.from('stock_movements').delete().eq('id', id);
      const { data } = await c.gestao.client.from('stock_movements').select('quantidade').eq('id', id).single();
      expect(Number(data.quantidade)).toBe(4);
    } finally { await c.limpar(); }
  });

  it('isolamento: outra escola não vê nem movimenta; item de outra escola é recusado', async () => {
    const c = await montaCenario();
    try {
      const { data } = await c.gestaoB.client.from('stock_items').select('id');
      expect(data).toEqual([]);
      const { error } = await registrar(c.gestaoB.client, c.item.id, 'entrada', 1);
      expect(error?.message).toMatch(/Item não encontrado/);
      const { error: forjado } = await c.gestaoB.client.from('stock_items')
        .insert({ school_id: c.schoolA, nome: 'Vitest Forjado' });
      expect(forjado).not.toBeNull();
      const { data: saldos } = await c.gestaoB.client.from('stock_balances').select('item_id');
      expect(saldos).toEqual([]);
    } finally { await c.limpar(); }
  });

  it('item com movimento não se apaga; sem movimento a Gestão apaga; outros perfis e escolas não', async () => {
    const c = await montaCenario();
    try {
      await registrar(c.gestao.client, c.item.id, 'entrada', 2);
      const { error: comHistorico } = await c.gestao.client.from('stock_items').delete().eq('id', c.item.id);
      expect(comHistorico).not.toBeNull();
      const { data } = await c.gestao.client.from('stock_items').select('id').eq('id', c.item.id);
      expect(data.length).toBe(1);

      const { data: erro } = await c.gestao.client.from('stock_items')
        .insert({ school_id: c.schoolA, nome: 'Vitest Item por engano' }).select('id').single();
      for (const u of [c.gestaoB, c.recepcao, c.prof, c.familia]) {
        await u.client.from('stock_items').delete().eq('id', erro.id);
      }
      expect((await c.gestao.client.from('stock_items').select('id').eq('id', erro.id)).data.length).toBe(1);
      const { error: ok } = await c.coord.client.from('stock_items').delete().eq('id', erro.id);
      expect(ok).toBeNull();
      expect((await c.gestao.client.from('stock_items').select('id').eq('id', erro.id)).data.length).toBe(0);
    } finally { await c.limpar(); }
  });

  it('nome repetido na escola é recusado e item inativo não recebe movimento', async () => {
    const c = await montaCenario();
    try {
      const { error } = await c.gestao.client.from('stock_items')
        .insert({ school_id: c.schoolA, nome: ' vitest papel a4 ' });
      expect(error).not.toBeNull();
      const { error: baixa } = await c.gestao.client.from('stock_items').update({ ativo: false }).eq('id', c.item.id);
      expect(baixa).toBeNull();
      expect((await registrar(c.gestao.client, c.item.id, 'entrada', 1)).error?.message).toMatch(/inativo/);
    } finally { await c.limpar(); }
  });
});
