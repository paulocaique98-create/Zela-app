import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FORMATOS_EXPORTACAO, COLUNAS_ALUNOS, linhasDaExportacao, textoSeguro, nomeDoArquivo, formatarNascimento } from './exportarAlunos';

const modal = readFileSync(new URL('../components/ExportarAlunosModal.jsx', import.meta.url), 'utf8');
const tela = readFileSync(new URL('../components/MarketingAlunos.jsx', import.meta.url), 'utf8');

describe('exportação da lista de alunos (Marketing)', () => {
  it('oferece Excel, PDF e CSV, nessa ordem', () => {
    expect(FORMATOS_EXPORTACAO.map(f => f.label)).toEqual(['Excel', 'PDF', 'CSV']);
  });

  it('o modal faz a pergunta combinada e lista os formatos na ordem', () => {
    expect(modal).toContain('Em qual formato você quer exportar?');
    expect(modal).toContain('FORMATOS_EXPORTACAO.map');
  });

  it('as colunas são só as aprovadas, sem foto', () => {
    expect(COLUNAS_ALUNOS.map(c => c.label)).toEqual(['Aluno', 'Turma', 'Turno', 'Nascimento', 'Idade', 'Responsável', 'Telefone']);
  });

  it('formata linhas, data e nome do arquivo', () => {
    const linhas = linhasDaExportacao([{ nome: 'Ana', turma: 'Kids I', turno: 'Manhã', nascimento: '2021-03-10', idade: 5, responsavel_nome: 'Bia', responsavel_telefone: '1199' }]);
    expect(linhas).toEqual([['Ana', 'Kids I', 'Manhã', '10/03/2021', 5, 'Bia', '1199']]);
    expect(formatarNascimento(null)).toBe('');
    expect(nomeDoArquivo('pdf', new Date('2026-11-05T12:00:00Z'))).toBe('alunos-2026-11-05.pdf');
  });

  it('neutraliza texto que o Excel leria como fórmula', () => {
    expect(textoSeguro('=SOMA(A1)')).toBe("'=SOMA(A1)");
    expect(textoSeguro('+55 11')).toBe("'+55 11");
    expect(textoSeguro('Maria')).toBe('Maria');
  });

  it('a tela exporta a lista filtrada e grava a trilha no servidor', () => {
    expect(tela).toContain('exportarAlunos(formato, filtrados');
    expect(tela).toContain("marketing_registrar_exportacao");
    expect(tela).toContain("marketing_lista_alunos");
    expect(tela).not.toMatch(/from\('students'\)/);
  });
});
