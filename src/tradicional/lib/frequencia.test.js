import { describe, it, expect } from 'vitest';
import { calcularFrequencia } from './frequencia';

const aulas = [
  { id: 'a1', qtd_aulas: 2 },
  { id: 'a2', qtd_aulas: 1 },
  { id: 'a3', qtd_aulas: 1 },
];
const reg = (aula_id, status, student_id = 's1') => ({ aula_id, student_id, status });

describe('calcularFrequencia', () => {
  it('sem registros devolve sem_dados', () => {
    expect(calcularFrequencia({ aulas, registros: [], studentId: 's1' }).situacao).toBe('sem_dados');
  });

  it('pondera pela quantidade de aulas do dia', () => {
    const r = calcularFrequencia({ aulas, registros: [reg('a1', 'falta'), reg('a2', 'presente'), reg('a3', 'presente')], studentId: 's1' });
    expect(r).toMatchObject({ total: 4, faltas: 2, percentual: 50, situacao: 'abaixo' });
  });

  it('falta justificada conta como ausência', () => {
    const r = calcularFrequencia({ aulas, registros: [reg('a1', 'presente'), reg('a2', 'justificada'), reg('a3', 'presente')], studentId: 's1' });
    expect(r).toMatchObject({ total: 4, faltas: 1, justificadas: 1, percentual: 75, situacao: 'atencao' });
  });

  it('80% ou mais é ok', () => {
    const quatro = [{ id: 'x', qtd_aulas: 4 }, { id: 'y', qtd_aulas: 1 }];
    expect(calcularFrequencia({ aulas: quatro, registros: [reg('x', 'presente'), reg('y', 'falta')], studentId: 's1' }))
      .toMatchObject({ percentual: 80, situacao: 'ok' });
  });

  it('ignora outro aluno e aula desconhecida', () => {
    const r = calcularFrequencia({ aulas, registros: [reg('a1', 'falta', 's2'), reg('zzz', 'falta')], studentId: 's1' });
    expect(r.situacao).toBe('sem_dados');
  });
});
