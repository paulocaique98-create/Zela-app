import { describe, it, expect } from 'vitest';
import { ocultoNoTradicional, ABAS_SO_MONTESSORI, ehTradicional } from './index';
import { ABAS_GESTAO_PEDAGOGICA, ABAS_SO_GESTAO, podeAbrirAba } from '../lib/perfisGestao';

// Todas as abas conhecidas da Gestão mais as dos portais Professor e Família.
const TODAS_AS_ABAS = [
  ...ABAS_GESTAO_PEDAGOGICA, ...ABAS_SO_GESTAO,
  'rel-mitigacao', 'rel-mapa-habilidades', 'frequencia', 'monitor', 'settings', 'diario', 'mural', 'cardapio',
];

describe('não regressão: o Tradicional não muda o que a Montessori vê', () => {
  it('Montessori, Personalizado e método não carregado veem exatamente as mesmas abas de antes', () => {
    for (const method of ['montessori', 'personalizado', null, undefined]) {
      for (const aba of TODAS_AS_ABAS) {
        expect(ocultoNoTradicional(method, aba), `${method} / ${aba}`).toBe(false);
      }
    }
  });

  it('na Gestão, o filtro novo não altera podeAbrirAba para quem não é Tradicional', () => {
    const features = { relatorios_pedagogicos: true, frequencia: true, materias: true };
    for (const role of ['gestao', 'coordenacao', 'direcao', 'financeiro', 'admin']) {
      for (const aba of TODAS_AS_ABAS) {
        const antes = podeAbrirAba(role, aba, features);
        const depois = podeAbrirAba(role, aba, features) && !ocultoNoTradicional('montessori', aba);
        expect(depois, `${role} / ${aba}`).toBe(antes);
      }
    }
  });

  it('o Tradicional esconde somente as quatro abas de Mitigação e Mapa de Habilidades', () => {
    const escondidas = TODAS_AS_ABAS.filter(aba => ocultoNoTradicional('tradicional', aba));
    expect([...new Set(escondidas)].sort()).toEqual([...ABAS_SO_MONTESSORI].sort());
  });

  it('só o método tradicional explícito conta como Tradicional', () => {
    expect(ehTradicional('tradicional')).toBe(true);
    for (const m of ['montessori', 'personalizado', '', null, undefined]) expect(ehTradicional(m)).toBe(false);
  });
});
