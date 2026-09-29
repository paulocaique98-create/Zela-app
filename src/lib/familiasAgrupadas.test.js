import { describe, it, expect } from 'vitest';
import { agruparFamilias, papeisNaFamilia } from './familiasAgrupadas';

const davi = { id: 's-davi', name: 'Davi Galvão Graciliano', family_id: 'u-emerson' };
const joana = { id: 's-joana', name: 'Joana Galvão Graciliano', family_id: 'u-rosana' };
const ana = { id: 's-ana', name: 'Ana Souza', family_id: 'u-maria' };
const alunos = new Map([davi, joana, ana].map(s => [s.id, s]));

const emerson = {
  id: 'u-emerson', name: 'Emerson Cruz Graciliano', students: [davi],
  vinculos: [
    { student_id: 's-davi', relationship: 'Responsável Principal', is_financial: true },
    { student_id: 's-joana', relationship: 'Pai', is_financial: false },
  ],
};
const rosana = {
  id: 'u-rosana', name: 'Rosana Machado Galvão Graciliano', students: [joana],
  vinculos: [
    { student_id: 's-joana', relationship: 'Responsável Principal', is_financial: true },
    { student_id: 's-davi', relationship: 'Mãe', is_financial: false },
  ],
};
const maria = { id: 'u-maria', name: 'Maria Souza', students: [ana], vinculos: [{ student_id: 's-ana', is_financial: true }] };
const joao = { id: 'u-joao', name: 'João Souza', students: [], vinculos: [{ student_id: 's-ana', relationship: 'Pai', is_financial: false }] };
const solo = { id: 'u-solo', name: 'Sem Aluno', students: [], vinculos: [] };

describe('Gerenciamento › Usuários · um cartão por família real', () => {
  it('dois titulares ligados aos filhos um do outro viram um cartão só, com os dois filhos', () => {
    const grupos = agruparFamilias([rosana, maria, emerson, joao, solo], alunos);
    expect(grupos).toHaveLength(3);
    const graciliano = grupos.find(g => g.guardians.some(u => u.id === 'u-emerson'));
    expect(graciliano.guardians.map(u => u.id).sort()).toEqual(['u-emerson', 'u-rosana']);
    expect(graciliano.students.map(s => s.id)).toEqual(['s-davi', 's-joana']);
  });

  it('continua juntando o 2º responsável sem aluno próprio ao titular; quem não tem aluno fica sozinho', () => {
    const grupos = agruparFamilias([maria, joao, solo], alunos);
    const souza = grupos.find(g => g.guardians.some(u => u.id === 'u-maria'));
    expect(souza.guardians.map(u => u.id)).toEqual(['u-maria', 'u-joao']);
    expect(grupos.find(g => g.key === 'u-solo').students).toEqual([]);
    // Ninguém some e ninguém aparece duas vezes.
    expect(grupos.flatMap(g => g.guardians.map(u => u.id)).sort()).toEqual(['u-joao', 'u-maria', 'u-solo']);
  });

  it('papel de cada responsável em cada criança', () => {
    expect(papeisNaFamilia(emerson, alunos)).toBe('Davi: titular e financeiro · Joana: pai');
    expect(papeisNaFamilia(rosana, alunos)).toBe('Davi: mãe · Joana: titular e financeiro');
    expect(papeisNaFamilia(joao, alunos)).toBe('Ana: pai');
  });
});
