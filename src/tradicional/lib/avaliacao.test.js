import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import {
  arredondar, lerNota, mediaPonderada, notaDoPeriodo, situacaoDoPeriodo,
  calcularPeriodo, periodosDaConfig, CONFIG_PADRAO,
} from './avaliacao';

describe('avaliação tradicional', () => {
  it('padrão: bimestre e média 7,0', () => {
    expect(CONFIG_PADRAO).toEqual({ periodo_tipo: 'bimestre', media_minima: 7 });
    expect(periodosDaConfig('bimestre')).toHaveLength(4);
    expect(periodosDaConfig('trimestre').map(p => p.label)).toEqual(['1º Trimestre', '2º Trimestre', '3º Trimestre']);
  });

  it('arredonda meio para cima com uma casa', () => {
    expect(arredondar(7.25)).toBe(7.3);
    expect(arredondar(6.94)).toBe(6.9);
  });

  it('lê nota com vírgula e rejeita fora de 0 a 10', () => {
    expect(lerNota('7,5')).toEqual({ ok: true, valor: 7.5 });
    expect(lerNota('10')).toEqual({ ok: true, valor: 10 });
    expect(lerNota('0')).toEqual({ ok: true, valor: 0 });
    expect(lerNota('10,1').ok).toBe(false);
    expect(lerNota('-1').ok).toBe(false);
    expect(lerNota('abc').ok).toBe(false);
    expect(lerNota('  ').vazio).toBe(true);
  });

  it('média ponderada usa os pesos e ignora itens sem nota', () => {
    expect(mediaPonderada([{ nota: 10, peso: 2 }, { nota: 4, peso: 1 }])).toBe(8);
    expect(mediaPonderada([{ nota: 6, peso: 1 }, { nota: NaN, peso: 1 }])).toBe(6);
    expect(mediaPonderada([])).toBeNull();
  });

  it('recuperação substitui a nota do período, mesmo sendo menor', () => {
    expect(notaDoPeriodo({ regulares: [{ nota: 5, peso: 1 }], recuperacao: 8 })).toEqual({ nota: 8, recuperada: true });
    expect(notaDoPeriodo({ regulares: [{ nota: 6, peso: 1 }], recuperacao: 4 })).toEqual({ nota: 4, recuperada: true });
    expect(notaDoPeriodo({ regulares: [{ nota: 6, peso: 1 }] })).toEqual({ nota: 6, recuperada: false });
  });

  it('situação compara com a média mínima da escola', () => {
    expect(situacaoDoPeriodo(7)).toBe('acima');
    expect(situacaoDoPeriodo(6.9)).toBe('abaixo');
    expect(situacaoDoPeriodo(6, 6)).toBe('acima');
    expect(situacaoDoPeriodo(null)).toBe('sem_nota');
  });

  it('calcula o período de um aluno só com as avaliações daquele período', () => {
    const avaliacoes = [
      { id: 'p1', tipo: 'prova', peso: 2, periodo: 1 },
      { id: 't1', tipo: 'trabalho', peso: 1, periodo: 1 },
      { id: 'r1', tipo: 'recuperacao', peso: 1, periodo: 1 },
      { id: 'p2', tipo: 'prova', peso: 1, periodo: 2 },
    ];
    expect(calcularPeriodo({ avaliacoes, notas: { p1: 10, t1: 4, p2: 2 }, periodo: 1, mediaMinima: 7 }))
      .toEqual({ nota: 8, recuperada: false, situacao: 'acima' });
    expect(calcularPeriodo({ avaliacoes, notas: { p1: 3, t1: 4, r1: 7 }, periodo: 1, mediaMinima: 7 }))
      .toEqual({ nota: 7, recuperada: true, situacao: 'acima' });
    expect(calcularPeriodo({ avaliacoes, notas: {}, periodo: 2, mediaMinima: 7 }).situacao).toBe('sem_nota');
  });
});
