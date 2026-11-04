import { describe, it, expect } from 'vitest';
import { mudancasDoRegistro, formatarValor } from './configFaturamento';

describe('configFaturamento', () => {
  it('lista só o campo que mudou na configuração', () => {
    const m = mudancasDoRegistro({
      tabela: 'zela_config_comercial',
      antes: { carencia_dias: 15, multa_percent: 2, updated_at: 'a' },
      depois: { carencia_dias: 20, multa_percent: 2, updated_at: 'b' },
    });
    expect(m).toEqual([{ origem: 'Configuração', campo: 'Carência até o bloqueio (dias)', antes: '15 dias', depois: '20 dias' }]);
  });

  it('nomeia a condição e formata desconto e ativo', () => {
    const m = mudancasDoRegistro({
      tabela: 'zela_condicoes_pagamento',
      antes: { chave: 'anual_vista', desconto_percent: 15, ativo: true },
      depois: { chave: 'anual_vista', desconto_percent: 12.5, ativo: false },
    });
    expect(m.map(x => [x.origem, x.campo, x.antes, x.depois])).toEqual([
      ['Anual à vista', 'Desconto', '15%', '12,5%'],
      ['Anual à vista', 'Condição ativa', 'Sim', 'Não'],
    ]);
  });

  it('insert não tem valor anterior e a lista de descontos é formatada', () => {
    const m = mudancasDoRegistro({ tabela: 'zela_config_comercial', antes: null, depois: { desconto_mensalidade_opcoes: [5, 10] } });
    expect(m[0].antes).toBeNull();
    expect(m[0].depois).toBe('5%, 10%');
    expect(formatarValor('brl', 600)).toContain('600');
  });
});
