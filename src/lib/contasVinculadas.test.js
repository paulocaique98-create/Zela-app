import { describe, it, expect } from 'vitest';
import { rotuloDaConta, tituloDaConta, totalNaoLidas, mostrarBotaoDeContas, mensagemDaFuncao } from './contasVinculadas.js';
import { destinatariosComVinculos, tituloViaVinculo, chaveDoAparelho } from '../../supabase/functions/_shared/pushCore.ts';

describe('contas vinculadas · botão do cabeçalho', () => {
  it('rótulo de cada perfil', () => {
    expect(rotuloDaConta({ role: 'family' })).toBe('Responsável');
    expect(rotuloDaConta({ role: 'gestao_pedagogica', departamento: 'coordenacao' })).toBe('Coordenação');
    expect(rotuloDaConta({ role: 'gestao_pedagogica', departamento: 'diretoria_pedagogica' })).toBe('Direção');
    expect(rotuloDaConta({ role: 'admin', departamento: 'recepcao' })).toBe('Recepção');
    expect(rotuloDaConta({ role: 'admin' })).toBe('Recepção');
    expect(rotuloDaConta({ role: 'admin', departamento: 'secretaria' })).toBe('Equipe');
    expect(rotuloDaConta({ role: 'teacher' })).toBe('Professora');
    expect(rotuloDaConta({ role: 'gestao' })).toBe('Gestão');
  });

  it('título: família mostra os filhos, equipe mostra a escola, sem hífen', () => {
    expect(tituloDaConta({ role: 'family', alunos: ['Maitê'], escola: 'Montessori' })).toBe('Responsável · Maitê');
    expect(tituloDaConta({ role: 'family', alunos: [], escola: 'Montessori' })).toBe('Responsável · Montessori');
    expect(tituloDaConta({ role: 'gestao_pedagogica', departamento: 'coordenacao', escola: 'Montessori' })).toBe('Coordenação · Montessori');
    expect(tituloDaConta({ role: 'family', alunos: ['Ana', 'Bia'] })).not.toContain('-');
  });

  it('avisos não lidos contam só das outras contas', () => {
    expect(totalNaoLidas([{ atual: true, nao_lidas: 9 }, { atual: false, nao_lidas: 2 }, { atual: false, nao_lidas: 1 }])).toBe(3);
    expect(totalNaoLidas(null)).toBe(0);
  });

  it('botão: equipe sempre, família só com vínculo, suporte nunca', () => {
    expect(mostrarBotaoDeContas('gestao_pedagogica', [])).toBe(true);
    expect(mostrarBotaoDeContas('admin', [])).toBe(true);
    expect(mostrarBotaoDeContas('teacher', [])).toBe(true);
    expect(mostrarBotaoDeContas('family', [])).toBe(false);
    expect(mostrarBotaoDeContas('family', [{ atual: true }])).toBe(false);
    expect(mostrarBotaoDeContas('family', [{ atual: true }, { atual: false }])).toBe(true);
    expect(mostrarBotaoDeContas('developer', [{ atual: true }, { atual: false }])).toBe(false);
  });

  it('lê a mensagem de erro devolvida pela função', async () => {
    const erro = { context: { json: async () => ({ error: 'E-mail ou senha incorretos.' }) } };
    expect(await mensagemDaFuncao(erro, 'x')).toBe('E-mail ou senha incorretos.');
    expect(await mensagemDaFuncao({ context: { json: async () => { throw new Error(); } } }, 'padrão')).toBe('padrão');
    expect(await mensagemDaFuncao(null, 'padrão')).toBe('padrão');
  });
});

describe('contas vinculadas · notificações das duas contas', () => {
  const vinculos = [
    { user_id: 'mae', grupo: 'g1' }, { user_id: 'coord', grupo: 'g1' },
    { user_id: 'outra', grupo: 'g2' }, { user_id: 'outra2', grupo: 'g2' },
  ];

  it('aviso para a conta de mãe chega também na conta da Coordenação', () => {
    const { todos, viaVinculo } = destinatariosComVinculos(['mae'], vinculos);
    expect(todos).toEqual(['mae', 'coord']);
    expect(viaVinculo).toEqual({ coord: 'mae' });
  });

  it('não mistura grupos nem duplica quem já é destinatário', () => {
    const { todos, viaVinculo } = destinatariosComVinculos(['mae', 'coord', 'sem-vinculo'], vinculos);
    expect(todos).toEqual(['mae', 'coord', 'sem-vinculo']);
    expect(viaVinculo).toEqual({});
    expect(destinatariosComVinculos(['sem-vinculo'], vinculos).todos).toEqual(['sem-vinculo']);
  });

  it('título indica o perfil de origem; aparelho identificado por inscrição', () => {
    expect(tituloViaVinculo('Entrada registrada', 'family')).toBe('Entrada registrada · Responsável');
    expect(tituloViaVinculo('Nova mensagem', 'gestao_pedagogica')).toBe('Nova mensagem · Coordenação');
    expect(tituloViaVinculo('Aviso', 'desconhecido')).toBe('Aviso');
    expect(chaveDoAparelho({ endpoint: 'https://push/1' })).toBe(chaveDoAparelho({ platform: 'web', endpoint: 'https://push/1' }));
    expect(chaveDoAparelho({ platform: 'android', token: 'abc' })).toBe('android:abc');
  });
});
