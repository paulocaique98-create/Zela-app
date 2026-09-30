import { describe, it, expect } from 'vitest';
import { situacaoDoAluno, contarSituacoes, MENSAGEM_VAZIA, GRUPOS_PRESENCA } from './presencaDiaria.js';

describe('Presença Diária: Presentes, Solicitações, Já saíram e Ausentes', () => {
  it('cada status cai em um grupo só', () => {
    expect(situacaoDoAluno('in_school')).toBe('presentes');
    expect(situacaoDoAluno('pending_entry')).toBe('solicitacoes');
    expect(situacaoDoAluno('pending_exit')).toBe('solicitacoes');
    expect(situacaoDoAluno('left')).toBe('sairam');
    expect(situacaoDoAluno('idle')).toBe('ausentes');
    expect(situacaoDoAluno('absent')).toBe('ausentes');
    expect(situacaoDoAluno(null)).toBe('ausentes');
  });

  it('contagem: quem já saiu ou está com solicitação não conta como presente', () => {
    const alunos = [
      { status: 'in_school' }, { status: 'pending_exit' }, { status: 'pending_entry' },
      { status: 'left' }, { status: 'idle' }, { status: 'absent' },
    ];
    expect(contarSituacoes(alunos)).toEqual({ presentes: 1, solicitacoes: 2, sairam: 1, ausentes: 2 });
    expect(contarSituacoes(null)).toEqual({ presentes: 0, solicitacoes: 0, sairam: 0, ausentes: 0 });
  });

  it('quatro botões na ordem pedida, com mensagem de lista vazia sem hífen', () => {
    expect(GRUPOS_PRESENCA.map(g => g.rotulo)).toEqual(['Presentes', 'Solicitações', 'Já saíram', 'Ausentes']);
    for (const g of GRUPOS_PRESENCA) {
      expect(MENSAGEM_VAZIA[g.id]).toBeTruthy();
      expect(MENSAGEM_VAZIA[g.id]).not.toContain('-');
    }
  });
});
