import { describe, it, expect } from 'vitest';
import { mesmaPessoa, escolherCadastroDaFoto } from './fotoResponsavel';

const PAI = { id: 'u-pai', name: 'Abraham Barouch Gilbert' };
const TITULAR = 't-1';

describe('foto do responsável em Gerenciamento › Usuários', () => {
  it('2º responsável: usa o cadastro com foto na conta do titular, não o vazio da própria conta', () => {
    const cadastros = [
      { id: 'vazio', name: 'Abraham Barouch Gilbert', relation: 'Pai', family_id: 'u-pai', photo_storage_path: null },
      { id: 'antigo', name: 'Abraham Barouch Gilbert', relation: 'Pai/Mãe', family_id: TITULAR, photo_storage_path: 's/antigo.jpg' },
    ];
    expect(escolherCadastroDaFoto(PAI, cadastros, new Set([TITULAR])).id).toBe('antigo');
  });

  it('sem ser 2º responsável daquela família, o cadastro de lá não conta', () => {
    const cadastros = [{ id: 'outra', name: 'Abraham Barouch Gilbert', relation: 'Pai/Mãe', family_id: 'x', photo_storage_path: 's/o.jpg' }];
    expect(escolherCadastroDaFoto(PAI, cadastros, new Set([TITULAR]))).toBeNull();
  });

  it('nome escrito diferente na própria conta ("Lígia Hoffman")', () => {
    const user = { id: 'u-ligia', name: 'Lígia Maria de Aguiar Hoffman' };
    const cadastros = [{ id: 'l', name: 'Lígia Hoffman', relation: 'Pai/Mãe', family_id: 'u-ligia', photo_storage_path: 's/l.jpg' }];
    expect(escolherCadastroDaFoto(user, cadastros).id).toBe('l');
  });

  it('titular: continua caindo no próprio cadastro "(Titular)"', () => {
    const user = { id: 'u-t', name: 'Maria Souza' };
    const cadastros = [
      { id: 'avo', name: 'Joana Souza', relation: 'Avó', family_id: 'u-t', photo_storage_path: 's/a.jpg' },
      { id: 'tit', name: 'Maria S. Souza', relation: 'Responsável (Titular)', family_id: 'u-t', photo_storage_path: 's/t.jpg' },
    ];
    expect(escolherCadastroDaFoto(user, cadastros).id).toBe('tit');
  });

  it('titular sem foto não pega a foto da avó de nome parecido na mesma conta', () => {
    const user = { id: 'u-m', name: 'Maria Souza' };
    const cadastros = [
      { id: 'tit', name: 'Maria Souza', relation: 'Responsável (Titular)', family_id: 'u-m', photo_storage_path: null },
      { id: 'avo', name: 'Maria Clara Souza', relation: 'Avó', family_id: 'u-m', photo_storage_path: 's/avo.jpg' },
    ];
    expect(escolherCadastroDaFoto(user, cadastros).id).toBe('tit');
  });

  it('avô de mesmo primeiro nome e sobrenome não é confundido com o pai', () => {
    expect(mesmaPessoa('João Alves da Silva', 'Avô/Avó', 'João Henrique Cosmo da Silva')).toBe(false);
    expect(mesmaPessoa('Diego Segatto Valadares Goaatico', 'Pai/Mãe', 'Diego Segatto Valadares Goastico')).toBe(true);
    expect(mesmaPessoa('Alice Magill', 'Pai/Mãe', 'Alice Henrique Ribeiro Magill')).toBe(true);
  });
});
