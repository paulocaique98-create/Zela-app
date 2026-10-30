import { describe, it, expect } from 'vitest';
import {
  PASSOS_PADRAO, rotuloDoPasso, modeloPadrao, preencher, variaveisDesconhecidas, validarPassos, validarHorario, resumoDosEnvios,
} from './reguaCobranca.js';

describe('régua de cobrança', () => {
  it('rotula os passos', () => {
    expect(rotuloDoPasso(-1)).toBe('1 dia antes do vencimento');
    expect(rotuloDoPasso(0)).toBe('No dia do vencimento');
    expect(rotuloDoPasso(10)).toBe('10 dias depois do vencimento');
  });

  it('modelos padrão não usam hífen e preenchem as variáveis', () => {
    for (const canal of ['push', 'email']) {
      for (const dias of [-3, -1, 0, 3, 10]) {
        const m = modeloPadrao(canal, dias);
        expect(`${m.assunto} ${m.texto}`).not.toContain('-');
        expect(preencher(m.texto)).not.toMatch(/[{}]/);
      }
    }
    expect(preencher('{aluno} deve {valor}')).toBe('Aluno Exemplo deve R$ 850,00');
  });

  it('acusa variável que o servidor não conhece', () => {
    expect(variaveisDesconhecidas('Olá {responsavel}, {nome} {valor}')).toEqual(['{nome}']);
    expect(variaveisDesconhecidas('Sem variáveis')).toEqual([]);
  });

  it('valida e ordena os passos', () => {
    expect(validarPassos([{ dias: 3, canais: ['email'] }, { dias: -3, canais: ['push'] }]).map(p => p.dias)).toEqual([-3, 3]);
    expect(() => validarPassos([])).toThrow();
    expect(() => validarPassos([{ dias: 1, canais: ['email'] }, { dias: 1, canais: ['push'] }])).toThrow(/mesmo dia/);
    expect(() => validarPassos([{ dias: 61, canais: ['email'] }])).toThrow();
    expect(() => validarPassos([{ dias: 1, canais: ['whatsapp'] }])).toThrow();
    expect(() => validarPassos([{ dias: 1, canais: [] }])).toThrow();
    expect(validarPassos(PASSOS_PADRAO)).toHaveLength(4);
  });

  it('valida o horário', () => {
    expect(validarHorario(8, 20)).toEqual({ inicio: 8, fim: 20 });
    expect(() => validarHorario(20, 8)).toThrow();
    expect(() => validarHorario(8, 25)).toThrow();
  });

  it('resume os envios', () => {
    expect(resumoDosEnvios([{ status: 'enviado' }, { status: 'enviado' }, { status: 'falhou' }])).toEqual({ enviado: 2, falhou: 1, ignorado: 0 });
  });
});
