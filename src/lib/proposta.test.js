import { describe, it, expect } from 'vitest';
import { montarProposta, semHifen } from './proposta';

const PRECOS = [
  { item_id: 'base', tipo_cobranca: 'por_aluno', valor: 6.9, ativo: true },
  { item_id: 'pedagogico', tipo_cobranca: 'por_aluno', valor: 3.5, ativo: true },
  { item_id: 'rotina', tipo_cobranca: 'por_aluno', valor: 2.5, ativo: true },
  { item_id: 'chat', tipo_cobranca: 'por_aluno', valor: 1.5, ativo: true },
];
const PLANO = { nome: 'Completo', modalidade: 'pacote', itens: ['pedagogico', 'rotina'], preco_por_aluno: 11.9, minimo_mensal: 790, implantacao_valor: 900, descricao: '' };
const CICLO = { ciclo: 'ANUAL', meses: 12, desconto_percent: 10, implantacao_valor: null };
const base = { cliente: { nome: 'Escola Teste' }, plano: PLANO, ciclo: CICLO, alunos: 100, precos: PRECOS, emitidaEm: new Date(2026, 9, 30), contatos: { whatsapp: '(11) 99999-0000', email: 'a@zela.com' } };

describe('montarProposta', () => {
  it('monta valores, itens e links', () => {
    const p = montarProposta(base);
    expect(p.erro).toBeNull();
    expect(p.itens.map(i => i.id)).toEqual(['pedagogico', 'rotina']);
    expect(p.valores.mensalCheia).toBe(1190);
    expect(p.valores.valorCiclo).toBe(12852);
    expect(p.valores.implantacao).toBe(900);
    expect(p.validadeAte).toBe('14/11/2026');
    expect(p.links.aceitar).toContain('https://wa.me/5511999990000?text=');
    expect(p.links.duvida).toMatch(/^mailto:a@zela.com/);
  });
  it('adicional avulso entra por cima do pacote', () => {
    const p = montarProposta({ ...base, extras: ['chat'] });
    expect(p.itens.map(i => i.id)).toContain('chat');
    expect(p.valores.mensalCheia).toBe(1340);
  });
  it('desconto acima do teto vira erro', () => {
    expect(montarProposta({ ...base, descontoMensal: { tipo: 'percent', valor: 50, recorrente: true } }).erro).toMatch(/máximo/);
  });
  it('sem escola, plano ou alunos devolve erro', () => {
    expect(montarProposta({ ...base, cliente: { nome: ' ' } }).erro).toBeTruthy();
    expect(montarProposta({ ...base, plano: null }).erro).toBeTruthy();
    expect(montarProposta({ ...base, alunos: 0 }).erro).toBeTruthy();
  });
  it('sem contato válido não gera link', () => {
    expect(montarProposta({ ...base, contatos: {} }).links).toEqual({ aceitar: null, duvida: null });
  });
});

describe('semHifen', () => {
  it('tira hífens de texto', () => expect(semHifen('(11) 99999-0000')).toBe('(11) 99999 0000'));
});
