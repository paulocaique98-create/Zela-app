import { describe, it, expect } from 'vitest';
import { documentosFaltando, documentosDaSolicitacao } from './matriculaFields.js';

const doc = (nome) => ({ path: `escola/familia/pedido/${nome}.jpg`, name: `${nome}.jpg` });
const respCompleto = { cpf_doc: doc('cpf'), rg_doc: doc('rg'), comprovante_residencia_doc: doc('comp'), plano_saude_doc: doc('sus') };

describe('seção 8 · Documentos da matrícula/rematrícula', () => {
  it('rematrícula completa: nada faltando', () => {
    const criancas = [{ nome: 'Maitê Oliveira', certidao_doc: doc('cert'), cartao_vacina_doc: doc('vac') }];
    expect(documentosFaltando(respCompleto, criancas)).toEqual([]);
  });

  it('lista o que falta, do responsável e de cada criança, sem hífen', () => {
    const criancas = [
      { nome: 'Maitê Oliveira', certidao_doc: doc('cert'), cartao_vacina_doc: null },
      { nome: 'Pedro Lima', certidao_doc: null, cartao_vacina_doc: null },
      { nome: '   ' }, // linha vazia do formulário não conta
    ];
    const faltando = documentosFaltando({ ...respCompleto, rg_doc: null }, criancas);
    expect(faltando).toEqual([
      'RG do responsável financeiro',
      'Cartão de Vacina de Maitê',
      'Certidão de Nascimento de Pedro',
      'Cartão de Vacina de Pedro',
    ]);
    for (const f of faltando) expect(f).not.toContain('-');
  });

  it('documento sem arquivo (sem caminho) conta como faltando', () => {
    expect(documentosFaltando({ ...respCompleto, cpf_doc: { name: 'x' } }, [])).toEqual(['CPF do responsável financeiro']);
  });

  it('a Gestão vê os documentos agrupados por pessoa, inclusive o cartão de vacina antigo', () => {
    const grupos = documentosDaSolicitacao({
      responsavel_financeiro: { ...respCompleto, cartao_vacina_doc: doc('vac-antigo') },
      criancas: [{ nome: 'Maitê', certidao_doc: doc('cert'), cartao_vacina_doc: doc('vac') }],
    });
    expect(grupos.map(g => g.titulo)).toEqual(['Responsável financeiro', 'Maitê']);
    expect(grupos[0].itens.map(i => i.label)).toEqual(['CPF', 'RG', 'Comprovante de Residência', 'Plano de Saúde ou SUS', 'Cartão de Vacina']);
    expect(grupos[1].itens.map(i => [i.label, Boolean(i.doc)])).toEqual([['Certidão de Nascimento', true], ['Cartão de Vacina', true]]);
  });
});
