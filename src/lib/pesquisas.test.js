import { describe, it, expect } from 'vitest';
import {
  statusEfetivo, formularioVazio, perguntaVazia, validarFormulario, validarParaPublicar, obrigatoriasFaltando,
  montarRespostas, paraInputLocal, deInputLocal, calcularNps, mediaDe, taxaResposta, serieDaPergunta, linhasExportacao,
} from './pesquisas';

const ok = () => ({ ...formularioVazio(new Date('2026-11-01T12:00:00Z')), titulo: 'Satisfação 2026', perguntas: [{ ...perguntaVazia('nps'), enunciado: 'Recomendaria?' }] });

describe('statusEfetivo', () => {
  const base = { abre_em: '2026-11-01T00:00:00Z', fecha_em: '2026-11-10T00:00:00Z' };
  it('rascunho e encerrada seguem o status gravado', () => {
    expect(statusEfetivo({ ...base, status: 'rascunho' })).toBe('rascunho');
    expect(statusEfetivo({ ...base, status: 'encerrada' })).toBe('encerrada');
  });
  it('publicada depende do prazo', () => {
    expect(statusEfetivo({ ...base, status: 'publicada' }, new Date('2026-10-31T00:00:00Z'))).toBe('agendada');
    expect(statusEfetivo({ ...base, status: 'publicada' }, new Date('2026-11-05T00:00:00Z'))).toBe('aberta');
    expect(statusEfetivo({ ...base, status: 'publicada' }, new Date('2026-11-10T00:00:00Z'))).toBe('encerrada');
  });
});

describe('validarFormulario', () => {
  it('formulário completo não tem erro', () => {
    expect(validarFormulario(ok())).toEqual([]);
  });
  it('título curto, turma faltando e datas invertidas', () => {
    const f = { ...ok(), titulo: 'ab', publico: 'turmas', turmas: [], fecha_em: '2026-10-01T00:00:00Z' };
    expect(validarFormulario(f)).toHaveLength(3);
  });
  it('múltipla exige 2 opções distintas', () => {
    const f = ok();
    f.perguntas = [{ ...perguntaVazia('multipla'), enunciado: 'Canal?', opcoes: ['App', ''] }];
    expect(validarFormulario(f)[0]).toMatch(/2 opções/);
    f.perguntas[0].opcoes = ['App', 'App'];
    expect(validarFormulario(f)[0]).toMatch(/repetidas/);
    f.perguntas[0].opcoes = ['App', 'Bilhete'];
    expect(validarFormulario(f)).toEqual([]);
  });
  it('publicar exige ao menos uma pergunta, rascunho não', () => {
    const f = { ...ok(), perguntas: [] };
    expect(validarFormulario(f)).toEqual([]);
    expect(validarParaPublicar(f)).toHaveLength(1);
  });
});

describe('respostas', () => {
  const ps = [{ id: 'a', obrigatoria: true }, { id: 'b', obrigatoria: false }, { id: 'c', obrigatoria: true }];
  it('aponta obrigatórias vazias (zero conta como resposta)', () => {
    expect(obrigatoriasFaltando(ps, { a: 0, b: '' })).toEqual(['c']);
  });
  it('monta só o que foi respondido', () => {
    expect(montarRespostas(ps, { a: 0, b: '  ', c: ' texto ' })).toEqual([
      { question_id: 'a', valor: '0' }, { question_id: 'c', valor: 'texto' },
    ]);
  });
});

describe('cálculos', () => {
  it('NPS: promotores 9 e 10, detratores até 6', () => {
    const r = calcularNps({ 10: 4, 9: 2, 8: 2, 7: 1, 3: 1 });
    expect(r).toMatchObject({ total: 10, promotores: 6, neutros: 3, detratores: 1, nps: 50 });
  });
  it('NPS sem respostas é nulo', () => {
    expect(calcularNps({}).nps).toBeNull();
  });
  it('média ponderada', () => {
    expect(mediaDe({ 5: 2, 3: 2 })).toBe(4);
    expect(mediaDe({})).toBeNull();
  });
  it('taxa de resposta limita a 100 e trata zero elegíveis', () => {
    expect(taxaResposta(5, 20)).toBe(25);
    expect(taxaResposta(5, 0)).toBeNull();
    expect(taxaResposta(30, 20)).toBe(100);
  });
});

describe('série e exportação', () => {
  it('NPS tem 11 barras, escala 5 e múltipla uma por opção', () => {
    expect(serieDaPergunta({ tipo: 'nps', distribuicao: { 10: 3 } })).toHaveLength(11);
    expect(serieDaPergunta({ tipo: 'escala5', distribuicao: { 5: 2 } })[4].valor).toBe(2);
    expect(serieDaPergunta({ tipo: 'multipla', opcoes: ['A', 'B'], distribuicao: { A: 1 } })).toEqual([{ nome: 'A', valor: 1 }, { nome: 'B', valor: 0 }]);
  });
  it('exportação marca pergunta oculta e resume NPS', () => {
    const linhas = linhasExportacao({ perguntas: [
      { ordem: 1, tipo: 'nps', enunciado: 'P1', respostas: 3, distribuicao: { 10: 3 } },
      { ordem: 2, tipo: 'escala5', enunciado: 'P2', oculto: true },
    ] });
    expect(linhas[0].resumo).toMatch(/^NPS 100/);
    expect(linhas[1].resumo).toMatch(/Oculto/);
  });
});

describe('datas do formulário', () => {
  it('ida e volta mantém o instante (minutos)', () => {
    const iso = '2026-11-05T15:30:00.000Z';
    expect(deInputLocal(paraInputLocal(iso))).toBe(iso);
  });
  it('valor inválido vira vazio', () => {
    expect(paraInputLocal('x')).toBe('');
    expect(deInputLocal('')).toBe('');
  });
});
