import { describe, it, expect } from 'vitest';
import {
  ITENS, estadoDoItem, ligarItem, normalizarFeatures, pacoteAtual, aplicarPacote, featuresIniciais, historicoDoItem, ITEM_POR_ID,
} from './modulosCatalogo';

// Como a ZL001 está hoje em produção (28/09/2026).
const ZL001 = {
  cadastros: true, calendario: true, cardapio: true, chat: true, checkin: true, comunicados: true, configuracoes: true,
  diario: true, financeiro: true, formularios: true, frequencia: true, gerenciamento: true, liveness_detection: true,
  materias: true, mural: true, relatorios_pedagogicos: true,
  face_engine_human: false, liveness_detection_enforce: false, qr_checkin: false,
};

describe('catálogo de módulos', () => {
  it('cada chave de features_enabled pertence a um item só', () => {
    const chaves = ITENS.flatMap(i => i.keys);
    expect(new Set(chaves).size).toBe(chaves.length);
    // As 19 chaves que a tela antiga mostrava continuam todas no catálogo.
    for (const k of Object.keys(ZL001)) expect(chaves).toContain(k);
  });

  it('módulo liga e desliga inteiro, nunca um submenu solto', () => {
    const off = ligarItem(ZL001, 'pedagogico', false);
    expect([off.relatorios_pedagogicos, off.frequencia, off.materias]).toEqual([false, false, false]);
    expect(estadoDoItem(off, ITEM_POR_ID.pedagogico)).toBe('off');
    const on = ligarItem(off, 'pedagogico', true);
    expect(estadoDoItem(on, ITEM_POR_ID.pedagogico)).toBe('on');
  });

  it('escola antiga com só parte do módulo ligado aparece como parcial', () => {
    expect(estadoDoItem({ ...ZL001, materias: false }, ITEM_POR_ID.pedagogico)).toBe('parcial');
    expect(pacoteAtual({ ...ZL001, materias: false })).toBe('livre');
  });

  it('plano base não desliga; app com a marca ainda não liga', () => {
    expect(ligarItem(ZL001, 'base', false)).toBe(ZL001);
    expect(ligarItem(ZL001, 'app_marca', true)).toBe(ZL001);
    expect(normalizarFeatures({ checkin: false }).checkin).toBe(true);
  });

  it('bloqueio da prova de vida depende da prova de vida', () => {
    const semProva = ligarItem(ZL001, 'liveness', false);
    expect(ligarItem(semProva, 'liveness_bloqueio', true)).toBe(semProva);
    const comBloqueio = ligarItem(ZL001, 'liveness_bloqueio', true);
    expect(comBloqueio.liveness_detection_enforce).toBe(true);
    // Desligar a prova de vida desliga o bloqueio junto.
    const desligada = ligarItem(comBloqueio, 'liveness', false);
    expect([desligada.liveness_detection, desligada.liveness_detection_enforce]).toEqual([false, false]);
  });

  it('pacotes: reconhece o atual e aplica sem mexer nas chaves técnicas', () => {
    expect(pacoteAtual(ZL001)).toBe('livre'); // Completo + Chat + Prova de vida, sem QR
    const premium = aplicarPacote({ ...ZL001, face_engine_human: true }, 'premium');
    expect(pacoteAtual(premium)).toBe('premium');
    expect(premium.qr_checkin).toBe(true);
    expect(premium.face_engine_human).toBe(true);
    const essencial = aplicarPacote(premium, 'essencial');
    expect(pacoteAtual(essencial)).toBe('essencial');
    // Financeiro é do plano base (01/10/2026): continua ligado no Essencial.
    expect([essencial.financeiro, essencial.diario, essencial.chat, essencial.checkin]).toEqual([true, false, false, true]);
    expect(pacoteAtual(aplicarPacote(ZL001, 'completo'))).toBe('completo');
  });

  it('escola nova começa no Essencial, com o plano base ligado', () => {
    const f = featuresIniciais();
    expect(pacoteAtual(f)).toBe('essencial');
    expect(ITEM_POR_ID.base.keys.every(k => f[k] === true)).toBe(true);
  });

  it('REGRA: todo módulo, adicional ou chave técnica começa desativado (inclusive os que forem criados depois)', () => {
    const f = featuresIniciais();
    const ativaveis = ITENS.filter(i => !i.fixo).flatMap(i => i.keys);
    expect(ativaveis.length).toBeGreaterThan(0);
    for (const k of ativaveis) expect([k, f[k]]).toEqual([k, false]);
  });

  it('histórico agrupa as chaves de um módulo mudadas juntas', () => {
    const changes = [
      { feature_key: 'frequencia', enabled: true, changed_at: '2026-09-28T10:00:00.120Z', changed_by_name: 'Paulo' },
      { feature_key: 'materias', enabled: true, changed_at: '2026-09-28T10:00:00.120Z', changed_by_name: 'Paulo' },
      { feature_key: 'relatorios_pedagogicos', enabled: true, changed_at: '2026-09-28T10:00:00.120Z', changed_by_name: 'Paulo' },
      { feature_key: 'materias', enabled: false, changed_at: '2026-09-29T08:00:00Z', changed_by_name: null },
      { feature_key: 'diario', enabled: true, changed_at: '2026-09-29T08:00:00Z', changed_by_name: null },
    ];
    const h = historicoDoItem(changes, ITEM_POR_ID.pedagogico);
    expect(h.map(g => [g.ligado, g.completo, g.chaves.length, g.autor])).toEqual([[false, false, 1, null], [true, true, 3, 'Paulo']]);
  });
});

describe('planos de 01/10/2026', () => {
  it('Financeiro e Contratos no plano base: ligado em todo plano e não se desliga', () => {
    expect(ITEM_POR_ID.base.keys).toContain('financeiro');
    expect(ITEM_POR_ID.base.inclui.map(i => i.nome)).toEqual(expect.arrayContaining(['Contratos e assinatura pelo app', 'Financeiro']));
    for (const plano of ['essencial', 'completo', 'premium']) expect(aplicarPacote({}, plano).financeiro).toBe(true);
    expect(normalizarFeatures({ financeiro: false }).financeiro).toBe(true);
    expect(ITEM_POR_ID.financeiro).toBeUndefined();
  });

  it('Chat é adicional separado: fora do Completo, dentro do Premium', () => {
    expect(ITEM_POR_ID.chat.grupo).toBe('adicional');
    expect(ITEM_POR_ID.rotina.keys).not.toContain('chat');
    expect(aplicarPacote({}, 'completo').chat).toBe(false);
    expect(aplicarPacote({}, 'premium').chat).toBe(true);
  });

  it('Essencial = só o plano base; Completo = + Pedagógico e Rotina; Premium = + Chat, Prova de vida e QR', () => {
    const essencial = aplicarPacote({}, 'essencial');
    const completo = aplicarPacote({}, 'completo');
    const premium = aplicarPacote({}, 'premium');
    expect([essencial.frequencia, essencial.diario, essencial.chat, essencial.qr_checkin]).toEqual([false, false, false, false]);
    expect([completo.frequencia, completo.diario, completo.chat, completo.qr_checkin]).toEqual([true, true, false, false]);
    expect([premium.frequencia, premium.diario, premium.chat, premium.liveness_detection, premium.qr_checkin]).toEqual([true, true, true, true, true]);
  });
});
