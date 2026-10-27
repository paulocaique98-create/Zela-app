import { describe, expect, it } from 'vitest';
import { proporPromocao, serieSeguinte } from './promocao';

const segmentos = [{ id: 'f1', nome: 'Fundamental I', ordem: 1 }, { id: 'f2', nome: 'Fundamental II', ordem: 2 }];
const series = [
  { id: 's1', segmento_id: 'f1', nome: '1º ano', ordem: 1 },
  { id: 's2', segmento_id: 'f1', nome: '2º ano', ordem: 2 },
  { id: 's6', segmento_id: 'f2', nome: '6º ano', ordem: 1 },
];
const origem = { id: 't1', serie_id: 's1', turno: 'tarde', nome: '1º A' };
const destinos = [
  { id: 'd1', serie_id: 's2', turno: 'manha', nome: '2º A' },
  { id: 'd2', serie_id: 's2', turno: 'tarde', nome: '2º B' },
  { id: 'd3', serie_id: 's1', turno: 'tarde', nome: '1º A' },
];
const base = { turmaOrigem: origem, series, segmentos, turmasDestinoAno: destinos };

describe('serieSeguinte', () => {
  it('avança no segmento e passa ao próximo segmento', () => {
    expect(serieSeguinte('s1', series, segmentos).id).toBe('s2');
    expect(serieSeguinte('s2', series, segmentos).id).toBe('s6');
    expect(serieSeguinte('s6', series, segmentos)).toBeNull();
  });
});

describe('proporPromocao', () => {
  it('aprovado sobe e sugere a turma do mesmo turno', () => {
    const p = proporPromocao({ ...base, resultado: { situacao: 'aprovado' } });
    expect(p.acao).toBe('sobe');
    expect(p.turmaSugerida.id).toBe('d2');
  });
  it('reprovado (também por frequência) repete a série', () => {
    for (const situacao of ['reprovado', 'reprovado_frequencia']) {
      const p = proporPromocao({ ...base, resultado: { situacao } });
      expect(p.acao).toBe('repete');
      expect(p.turmaSugerida.id).toBe('d3');
    }
  });
  it('recuperação final fica pendente até a Coordenação decidir', () => {
    expect(proporPromocao({ ...base, resultado: { situacao: 'recuperacao' } }).acao).toBe('pendente');
  });
  it('sem resultado fechado não propõe nada', () => {
    expect(proporPromocao({ ...base, resultado: null }).acao).toBe('sem_resultado');
  });
  it('aprovado na última série é concluinte', () => {
    const p = proporPromocao({ ...base, turmaOrigem: { ...origem, serie_id: 's6' }, resultado: { situacao: 'aprovado' } });
    expect(p.acao).toBe('concluinte');
    expect(p.turmaSugerida).toBeNull();
  });
  it('sem turma criada no ano de destino devolve lista vazia', () => {
    const p = proporPromocao({ ...base, turmasDestinoAno: [], resultado: { situacao: 'aprovado' } });
    expect(p.turmasDestino).toEqual([]);
  });
});
