import { describe, it, expect } from 'vitest';
import {
  formatarCodigo, normalizarCodigo, codigoValido, parseDisciplinas, disciplinasParaTexto, validarAnoExterno,
  linhaDoAnoExterno, montarAnos, pendenciasDeDados, montarConteudo, tipoPadraoDoHistorico, tiposDisponiveis, dataPorExtenso,
} from './documentosEscolares';

describe('código de verificação', () => {
  it('formata em grupos de 4 e normaliza de volta', () => {
    expect(formatarCodigo('a1b2c3d4e5f60718')).toBe('A1B2 C3D4 E5F6 0718');
    expect(normalizarCodigo('a1b2 c3d4-e5f6.0718')).toBe('A1B2C3D4E5F60718');
  });
  it('só aceita 16 caracteres hexadecimais', () => {
    expect(codigoValido('A1B2 C3D4 E5F6 0718')).toBe(true);
    expect(codigoValido('A1B2')).toBe(false);
    expect(codigoValido('ZZZZ C3D4 E5F6 0718')).toBe(false);
  });
});

describe('disciplinas em texto', () => {
  it('lê uma por linha com a nota depois dos dois pontos', () => {
    expect(parseDisciplinas('Matemática: 8,5\n\nHistória')).toEqual([
      { nome: 'Matemática', nota: '8,5' }, { nome: 'História', nota: '' },
    ]);
    expect(disciplinasParaTexto([{ nome: 'Matemática', nota: '8,5' }, { nome: 'Arte', nota: '' }])).toBe('Matemática: 8,5\nArte');
  });
});

describe('ano cursado fora', () => {
  const ok = { escola_origem: 'Escola X', ano_letivo: '2022', serie: '5º ano', uf: 'sp', carga_horaria: '800', frequencia: '92,5' };
  it('aceita o formulário completo', () => expect(validarAnoExterno(ok, 2026)).toBe(''));
  it('barra escola, ano, série, uf, carga e frequência inválidos', () => {
    expect(validarAnoExterno({ ...ok, escola_origem: ' ' }, 2026)).toMatch(/escola/i);
    expect(validarAnoExterno({ ...ok, ano_letivo: '2031' }, 2026)).toMatch(/ano/i);
    expect(validarAnoExterno({ ...ok, serie: '' }, 2026)).toMatch(/série/i);
    expect(validarAnoExterno({ ...ok, uf: 'SPP' }, 2026)).toMatch(/estado/i);
    expect(validarAnoExterno({ ...ok, carga_horaria: '0' }, 2026)).toMatch(/carga/i);
    expect(validarAnoExterno({ ...ok, frequencia: '120' }, 2026)).toMatch(/frequência/i);
  });
  it('converte para a linha do banco', () => {
    const l = linhaDoAnoExterno({ ...ok, disciplinas_texto: 'Arte: 9' }, 'u1');
    expect(l).toMatchObject({ uf: 'SP', ano_letivo: 2022, carga_horaria: 800, frequencia: 92.5, created_by: 'u1' });
    expect(l.disciplinas).toEqual([{ nome: 'Arte', nota: '9' }]);
  });
});

describe('montarAnos', () => {
  const internos = [{ ano: '2025', turma: '6º ano A', situacao: 'aprovado', frequencia: 95, boletim: [{ disciplina: 'Matemática', media_anual: 8.5 }], observacao: '' }];
  const externos = [{ ano_letivo: 2024, serie: '5º ano', escola_origem: 'Escola X', cidade: 'Santos', uf: 'SP', disciplinas: [{ nome: 'Arte', nota: '9' }], carga_horaria: 800, frequencia: '90.00', resultado: 'aprovado' }];
  it('ordena do mais antigo ao mais recente e mistura as origens', () => {
    const anos = montarAnos({ internos, externos, escolaNome: 'Escola Y' });
    expect(anos.map(a => [a.ano, a.origem])).toEqual([['2024', 'externa'], ['2025', 'interna']]);
    expect(anos[1].disciplinas[0]).toEqual({ nome: 'Matemática', nota: '8,5' });
    expect(anos[0].frequencia).toBe(90);
  });
  it('sem notas tira as disciplinas e mantém série e frequência', () => {
    const anos = montarAnos({ internos, externos, semNotas: true });
    expect(anos.every(a => a.disciplinas.length === 0)).toBe(true);
    expect(anos[1].frequencia).toBe(95);
  });
});

describe('pendências e conteúdo', () => {
  const escola = { name: 'Escola Y', razao_social: 'Escola Y Ltda', cnpj: '12345678000190', city: 'Santos', state: 'SP', street: 'Rua A', number: '10', director_name: 'Ana' };
  const aluno = { name: 'João', birth_date: '2015-03-02', cidade_nascimento: 'Santos' };
  it('lista o que falta sem bloquear', () => {
    expect(pendenciasDeDados({ escola: {}, aluno: {}, responsaveis: [], tipo: 'historico', anos: [] }).length).toBeGreaterThanOrEqual(7);
    expect(pendenciasDeDados({ escola, aluno, responsaveis: [{ nome: 'Maria' }], tipo: 'historico', anos: [{}], ato: 'Portaria 1' })).toEqual([]);
  });
  it('declaração leva texto e nenhum ano', () => {
    const c = montarConteudo({ tipo: 'declaracao_matricula', escola, aluno, data: '2026-10-29', turmaAtual: '6º ano A' });
    expect(c.anos).toEqual([]);
    expect(c.texto).toContain('João');
    expect(c.texto).toContain('02/03/2015');
    expect(c.texto).toContain('6º ano A');
    expect(c.texto).toContain('2026');
  });
  it('ficha de acompanhamento nunca leva notas', () => {
    const anos = [{ ano: '2025', disciplinas: [{ nome: 'Arte', nota: '9' }] }];
    const c = montarConteudo({ tipo: 'ficha_acompanhamento', escola, aluno, anos, metodo: 'montessori' });
    expect(c.semNotas).toBe(true);
    expect(c.anos[0].disciplinas).toEqual([]);
  });
  it('o conteúdo não carrega documento do aluno nem telefone do responsável', () => {
    const c = montarConteudo({ tipo: 'historico', escola, aluno: { ...aluno, doc_number: '999888' }, responsaveis: [{ nome: 'Maria', parentesco: 'Mãe', phone: '1' }], anos: [] });
    const texto = JSON.stringify(c);
    expect(texto).not.toContain('999888');
    expect(c.aluno.filiacao).toEqual([{ nome: 'Maria', parentesco: 'Mãe' }]);
  });
});

describe('tipos por método', () => {
  it('Montessori emite ficha, Tradicional emite histórico', () => {
    expect(tipoPadraoDoHistorico('montessori')).toBe('ficha_acompanhamento');
    expect(tipoPadraoDoHistorico('tradicional')).toBe('historico');
    expect(tiposDisponiveis('montessori')).not.toContain('historico');
    expect(tiposDisponiveis('tradicional')).toContain('historico');
  });
  it('data por extenso', () => expect(dataPorExtenso('2026-10-29')).toBe('29 de outubro de 2026'));
});
