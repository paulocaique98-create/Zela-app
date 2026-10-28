import { describe, it, expect } from 'vitest';
import { nomeDePlanilha } from './exportar';

describe('nomeDePlanilha', () => {
  it('tira caracteres proibidos e limita a 31', () => {
    expect(nomeDePlanilha('Previsto/Recebido: mês')).toBe('Previsto Recebido  mês');
    expect(nomeDePlanilha('x'.repeat(40))).toHaveLength(31);
  });
  it('não repete nomes já usados', () => {
    expect(nomeDePlanilha('Resultado', ['Resultado'])).toBe('Resultado 2');
    expect(nomeDePlanilha('Resultado', ['Resultado', 'Resultado 2'])).toBe('Resultado 3');
  });
});
