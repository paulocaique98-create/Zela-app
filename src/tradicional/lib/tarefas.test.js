import { describe, it, expect } from 'vitest';
import { validarTarefa, ordenarTarefas, estaVencida, anoDaSerie, componenteDaDisciplina, filtrarHabilidades } from './tarefas';

const ok = { titulo: 'Lista 3', descricao: '', data_entrega: '2026-11-10' };

describe('validarTarefa', () => {
  it('aceita tarefa completa', () => expect(validarTarefa(ok)).toBe(''));
  it('exige título', () => expect(validarTarefa({ ...ok, titulo: '  ' })).toMatch(/título/));
  it('limita título e descrição', () => {
    expect(validarTarefa({ ...ok, titulo: 'a'.repeat(121) })).toMatch(/120/);
    expect(validarTarefa({ ...ok, descricao: 'a'.repeat(2001) })).toMatch(/2000/);
  });
  it('exige data válida', () => expect(validarTarefa({ ...ok, data_entrega: '' })).toMatch(/data/));
});

describe('ordenarTarefas', () => {
  const lista = [
    { id: 'a', data_entrega: '2026-11-01' },
    { id: 'b', data_entrega: '2026-11-20' },
    { id: 'c', data_entrega: '2026-11-10' },
    { id: 'd', data_entrega: '2026-10-20' },
  ];
  it('futuras da mais próxima, depois vencidas da mais recente', () => {
    expect(ordenarTarefas(lista, '2026-11-05').map(t => t.id)).toEqual(['c', 'b', 'a', 'd']);
  });
  it('entrega hoje não está vencida', () => {
    expect(estaVencida({ data_entrega: '2026-11-05' }, '2026-11-05')).toBe(false);
    expect(estaVencida({ data_entrega: '2026-11-04' }, '2026-11-05')).toBe(true);
  });
});

describe('BNCC', () => {
  it('extrai o ano da série só de 1 a 5', () => {
    expect(anoDaSerie('3º ano')).toBe(3);
    expect(anoDaSerie('6º ano')).toBeNull();
    expect(anoDaSerie('Infantil')).toBeNull();
  });
  it('sugere o componente pelo nome da disciplina', () => {
    expect(componenteDaDisciplina('Língua Portuguesa')).toBe('Língua Portuguesa');
    expect(componenteDaDisciplina('Matemática')).toBe('Matemática');
    expect(componenteDaDisciplina('Ciencias')).toBe('Ciências');
    expect(componenteDaDisciplina('Artes')).toBe('');
  });
  it('filtra por ano e componente', () => {
    const cat = [
      { codigo: 'A', ano: 1, componente: 'Matemática' },
      { codigo: 'B', ano: 2, componente: 'Matemática' },
      { codigo: 'C', ano: 1, componente: 'História' },
    ];
    expect(filtrarHabilidades(cat, { ano: 1, componente: 'Matemática' }).map(h => h.codigo)).toEqual(['A']);
    expect(filtrarHabilidades(cat, { ano: 1, componente: '' }).map(h => h.codigo)).toEqual(['A', 'C']);
  });
});
