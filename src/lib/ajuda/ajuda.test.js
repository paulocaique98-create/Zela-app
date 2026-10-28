import { describe, it, expect } from 'vitest';
import { AJUDA_POR_PERFIL, filtrarAjuda, secoesDoMetodo } from './index';

describe('conteúdo da Central de Ajuda', () => {
  for (const [perfil, secoes] of Object.entries(AJUDA_POR_PERFIL)) {
    it(`${perfil}: seções e itens completos, sem ids repetidos`, () => {
      expect(secoes.length).toBeGreaterThan(0);
      const ids = new Set();
      for (const s of secoes) {
        expect(s.titulo).toBeTruthy();
        expect(s.itens.length).toBeGreaterThan(0);
        for (const it of s.itens) {
          expect(it.titulo).toBeTruthy();
          expect(it.serve).toBeTruthy();
          expect(Array.isArray(it.faz)).toBe(true);
          expect(ids.has(it.id)).toBe(false);
          ids.add(it.id);
        }
      }
    });

    it(`${perfil}: texto voltado ao usuário não usa travessão`, () => {
      const texto = JSON.stringify(secoes);
      expect(texto.includes('—')).toBe(false);
      expect(texto.includes(' - ')).toBe(false);
    });
  }
});

describe('filtrarAjuda', () => {
  const secoes = AJUDA_POR_PERFIL.admin;
  it('ignora acento e maiúscula', () => {
    const r = filtrarAjuda(secoes, 'RECEPCAO');
    expect(r.length).toBeGreaterThan(0);
  });
  it('filtra por seção', () => {
    const r = filtrarAjuda(secoes, '', 'checkin');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('checkin');
  });
  it('sem resultado devolve lista vazia', () => {
    expect(filtrarAjuda(secoes, 'zzzxyz')).toEqual([]);
  });
});

describe('conteúdo por método pedagógico', () => {
  const ids = (secoes) => secoes.flatMap((s) => s.itens.map((i) => i.id));

  it('Montessori não vê itens do Tradicional', () => {
    const mont = ids(secoesDoMetodo(AJUDA_POR_PERFIL.gestao, 'montessori'));
    expect(mont).not.toContain('aca-avaliacao');
    expect(mont).not.toContain('guia-trad-sequencia');
    expect(mont).toContain('guia-mont-relatorios');
    expect(mont).toContain('aca-mapa');
  });

  it('Tradicional não vê itens do Montessori', () => {
    const trad = ids(secoesDoMetodo(AJUDA_POR_PERFIL.gestao, 'tradicional'));
    expect(trad).not.toContain('aca-mapa');
    expect(trad).not.toContain('guia-mont-relatorios');
    expect(trad).toContain('guia-trad-sequencia');
  });

  it('Família: boletim só no Tradicional', () => {
    expect(ids(secoesDoMetodo(AJUDA_POR_PERFIL.familia, 'tradicional'))).toContain('boletim');
    expect(ids(secoesDoMetodo(AJUDA_POR_PERFIL.familia, 'montessori'))).not.toContain('boletim');
  });

  it('sem método conhecido mostra só o que é comum', () => {
    const comum = ids(secoesDoMetodo(AJUDA_POR_PERFIL.gestao, null));
    expect(comum).not.toContain('aca-avaliacao');
    expect(comum).not.toContain('aca-mapa');
    expect(comum).toContain('sec-alunos');
  });

  it('filtrarAjuda respeita o método na busca', () => {
    expect(filtrarAjuda(AJUDA_POR_PERFIL.gestao, 'promoção', 'todas', 'montessori')).toEqual([]);
    expect(filtrarAjuda(AJUDA_POR_PERFIL.gestao, 'promoção', 'todas', 'tradicional').length).toBeGreaterThan(0);
  });
});
