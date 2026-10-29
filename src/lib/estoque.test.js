import { describe, it, expect } from 'vitest';
import { lerQuantidade, formatarQuantidade, abaixoDoMinimo, variacao, textoBusca, categoriasSugeridas } from './estoque';

describe('estoque', () => {
  it('lê quantidade com vírgula ou ponto e recusa o resto', () => {
    expect(lerQuantidade('1,5')).toBe(1.5);
    expect(lerQuantidade(' 10 ')).toBe(10);
    expect(lerQuantidade('-2')).toBe(-2);
    expect(lerQuantidade('1,2345')).toBeNull();
    expect(lerQuantidade('abc')).toBeNull();
    expect(lerQuantidade('')).toBeNull();
  });

  it('formata no padrão brasileiro', () => {
    expect(formatarQuantidade(1234.5)).toBe('1.234,5');
    expect(formatarQuantidade('x')).toBe('0');
  });

  it('abaixo do mínimo só com mínimo definido', () => {
    expect(abaixoDoMinimo(2, 5)).toBe(true);
    expect(abaixoDoMinimo(5, 5)).toBe(false);
    expect(abaixoDoMinimo(0, 0)).toBe(false);
  });

  it('mostra a variação com sinal', () => {
    expect(variacao({ tipo: 'entrada', quantidade: '10' })).toBe('+10');
    expect(variacao({ tipo: 'saida', quantidade: '3.5' })).toBe('-3,5');
    expect(variacao({ tipo: 'ajuste', quantidade: '-1' })).toBe('-1');
  });

  it('categorias sugeridas seguem o método', () => {
    expect(categoriasSugeridas('montessori')).toContain('Vida Prática');
    expect(categoriasSugeridas('montessori')).not.toContain('Geografia');
    expect(categoriasSugeridas('tradicional')).toContain('Geografia');
    expect(categoriasSugeridas('personalizado')).toEqual(expect.arrayContaining(['Sensorial', 'História']));
    expect(categoriasSugeridas(null)).toEqual(['Papelaria', 'Limpeza', 'Higiene', 'Cozinha', 'Uniforme', 'Manutenção']);
  });

  it('busca ignora acento e caixa', () => {
    expect(textoBusca('  Água SANITÁRIA ')).toBe('agua sanitaria');
  });
});
