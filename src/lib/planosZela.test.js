import { describe, it, expect } from 'vitest';
import {
  valorPorAluno, valorFixoMensal, mensalidade, valorDoCiclo, implantacaoBase, implantacaoFinal, descontoMensalidade,
  modalidadesPermitidas, itensValidos, extrasDoPacote, passouDoLimite, sugestaoDePacote, diasParaVencer, CICLO_POR_ID,
  situacaoContrato, mensalVigente,
} from './planosZela';

const PRECOS = [
  { item_id: 'base', tipo_cobranca: 'por_aluno', valor: 6.9 },
  { item_id: 'pedagogico', tipo_cobranca: 'por_aluno', valor: 3.5 },
  { item_id: 'rotina', tipo_cobranca: 'por_aluno', valor: 2.5 },
  { item_id: 'chat', tipo_cobranca: 'por_aluno', valor: 1.5 },
  { item_id: 'liveness', tipo_cobranca: 'por_aluno', valor: 1.5 },
  { item_id: 'qr', tipo_cobranca: 'por_aluno', valor: 1 },
  { item_id: 'fixo_exemplo', tipo_cobranca: 'fixo_mensal', valor: 300 },
];
const COMPLETO = { modalidade: 'pacote', itens: ['pedagogico', 'rotina'], preco_por_aluno: 11.9, minimo_mensal: 790, implantacao_valor: 900 };
const POR_ALUNO = { modalidade: 'por_aluno', itens: [], preco_por_aluno: 0, minimo_mensal: 0, implantacao_valor: 600 };

describe('mensalidade', () => {
  it('usa o mínimo mensal quando os alunos não chegam nele', () => {
    expect(mensalidade(COMPLETO, 20, PRECOS)).toBe(790);
    expect(mensalidade(COMPLETO, 66, PRECOS)).toBe(790);
  });
  it('usa alunos x preço quando passa do mínimo', () => {
    expect(mensalidade(COMPLETO, 80, PRECOS)).toBe(952);
  });
  it('por aluno soma o base e os itens escolhidos', () => {
    expect(valorPorAluno(['pedagogico', 'chat'], PRECOS)).toBe(11.9);
    expect(mensalidade(POR_ALUNO, 40, PRECOS, ['pedagogico', 'chat'])).toBe(476);
  });
  it('soma os itens de cobrança fixa', () => {
    expect(valorFixoMensal(['fixo_exemplo', 'chat'], PRECOS)).toBe(300);
    expect(mensalidade(POR_ALUNO, 40, PRECOS, ['fixo_exemplo'])).toBe(576);
  });
  it('extra avulso de pacote soma por cima do mínimo', () => {
    expect(mensalidade(COMPLETO, 20, PRECOS, null, ['chat'])).toBe(820);
    expect(mensalidade(COMPLETO, 80, PRECOS, null, ['chat', 'qr'])).toBe(1152);
  });
  it('extra de pacote ignora item do plano, preço zero e item repetido', () => {
    const precos = [...PRECOS, { item_id: 'bolsas', tipo_cobranca: 'por_aluno', valor: 0 }];
    expect(extrasDoPacote(COMPLETO, ['pedagogico', 'chat', 'chat', 'bolsas', 'base'], precos)).toEqual(['chat']);
    expect(mensalidade(COMPLETO, 20, precos, null, ['pedagogico', 'bolsas'])).toBe(790);
  });
});

describe('desconto na mensalidade', () => {
  const ANUAL = { ciclo: 'ANUAL', meses: 12, desconto_percent: 10 };
  it('recorrente vale todos os meses do ciclo, em cascata com o desconto do ciclo', () => {
    expect(descontoMensalidade(1000, ANUAL, { tipo: 'percent', valor: 10 })).toEqual({ desconto: 90, mensalComDesconto: 810, valorCiclo: 9720, mesesDesconto: 12, erro: null });
  });
  it('por período vale só os meses definidos', () => {
    const r = descontoMensalidade(1000, ANUAL, { tipo: 'percent', valor: 10, recorrente: false, meses: 3 });
    expect(r.valorCiclo).toBe(10530);
    expect(r.mesesDesconto).toBe(3);
  });
  it('em reais respeita o teto e o valor do ciclo cheio sem desconto', () => {
    expect(descontoMensalidade(1000, ANUAL, { tipo: 'valor', valor: 90 }).erro).toBeNull();
    expect(descontoMensalidade(1000, ANUAL, { tipo: 'valor', valor: 100 }).erro).not.toBeNull();
    expect(descontoMensalidade(1000, ANUAL, {}).valorCiclo).toBe(10800);
  });
  it('recusa acima do teto, período fora do ciclo e valor negativo', () => {
    expect(descontoMensalidade(1000, ANUAL, { tipo: 'percent', valor: 11 }).erro).not.toBeNull();
    expect(descontoMensalidade(1000, ANUAL, { tipo: 'percent', valor: 5, recorrente: false, meses: 13 }).erro).not.toBeNull();
    expect(descontoMensalidade(1000, ANUAL, { tipo: 'percent', valor: 5, recorrente: false }).erro).not.toBeNull();
    expect(descontoMensalidade(1000, ANUAL, { tipo: 'percent', valor: -5 }).erro).not.toBeNull();
  });
});

describe('ciclos', () => {
  it('aplica meses e desconto de cada ciclo', () => {
    expect(valorDoCiclo(1000, { ciclo: 'MENSAL', desconto_percent: 0 })).toBe(1000);
    expect(valorDoCiclo(1000, { ...CICLO_POR_ID.SEMESTRAL, ciclo: 'SEMESTRAL', desconto_percent: 5 })).toBe(5700);
    expect(valorDoCiclo(952, { ciclo: 'ANUAL', desconto_percent: 10 })).toBe(10281.6);
    expect(valorDoCiclo(1000, { ciclo: 'BIANUAL', desconto_percent: 15 })).toBe(20400);
  });
});

describe('implantação', () => {
  it('usa a do ciclo quando existe, senão a do plano', () => {
    expect(implantacaoBase(COMPLETO, { implantacao_valor: null })).toBe(900);
    expect(implantacaoBase(COMPLETO, { implantacao_valor: 700 })).toBe(700);
  });
  it('desconto em porcentagem e em reais', () => {
    expect(implantacaoFinal(900, 'percent', 50, 50)).toEqual({ desconto: 450, final: 450, erro: null });
    expect(implantacaoFinal(900, 'valor', 200, 50)).toEqual({ desconto: 200, final: 700, erro: null });
  });
  it('recusa acima do teto e nunca deixa negativo', () => {
    expect(implantacaoFinal(900, 'percent', 60, 50).erro).not.toBeNull();
    expect(implantacaoFinal(900, 'valor', 500, 50).erro).not.toBeNull();
    expect(implantacaoFinal(900, 'percent', 100, 100).final).toBe(0);
    expect(implantacaoFinal(900, 'valor', 5000, 100).erro).not.toBeNull();
    expect(implantacaoFinal(900, 'valor', 900, 100).final).toBe(0);
  });
  it('sem desconto mantém a base', () => {
    expect(implantacaoFinal(900, 'percent', 0).final).toBe(900);
  });
});

describe('limite por aluno', () => {
  it('49, 50 e 51 alunos', () => {
    expect(modalidadesPermitidas(49)).toEqual(['por_aluno', 'pacote']);
    expect(modalidadesPermitidas(50)).toEqual(['por_aluno', 'pacote']);
    expect(modalidadesPermitidas(51)).toEqual(['pacote']);
  });
  it('alerta só para por aluno acima do limite', () => {
    expect(passouDoLimite({ modalidade: 'por_aluno' }, 51)).toBe(true);
    expect(passouDoLimite({ modalidade: 'por_aluno' }, 50)).toBe(false);
    expect(passouDoLimite({ modalidade: 'pacote' }, 300)).toBe(false);
  });
});

describe('itens', () => {
  it('rejeita técnicos, base, desconhecidos e repetidos', () => {
    expect(itensValidos(['liveness_bloqueio', 'motor_human', 'base', 'xyz', 'chat', 'chat'])).toEqual(['chat']);
  });
  it('sugere o preço do pacote com o desconto implícito', () => {
    const s = sugestaoDePacote(['pedagogico', 'rotina'], 11.9, PRECOS);
    expect(s.soma).toBe(12.9);
    expect(s.desconto).toBeCloseTo(7.75, 1);
  });
});

describe('vencimento', () => {
  it('conta dias até o fim', () => {
    const hoje = new Date(2026, 9, 5);
    expect(diasParaVencer('2026-10-15', hoje)).toBe(10);
    expect(diasParaVencer('2026-10-01', hoje)).toBe(-4);
    expect(diasParaVencer(null, hoje)).toBeNull();
  });
});

describe('painel de contratos', () => {
  const hoje = new Date(2026, 9, 5);
  it('situação', () => {
    expect(situacaoContrato({ status: 'ativa', fim: '2026-12-01' }, true, hoje)).toBe('Ativo');
    expect(situacaoContrato({ status: 'ativa', fim: '2026-10-01' }, true, hoje)).toBe('Vencido');
    expect(situacaoContrato({ status: 'ativa', fim: '2026-12-01' }, false, hoje)).toBe('Inativo');
    expect(situacaoContrato(null, true, hoje)).toBe('Inativo');
  });
  it('mensal vigente com desconto por período', () => {
    const ct = { valor_mensal: 100, valor_mensal_com_desconto: 90, mensal_desconto: 10, mensal_desconto_recorrente: false, mensal_desconto_meses: 3, inicio: '2026-09-01' };
    expect(mensalVigente(ct, hoje)).toBe(90);
    expect(mensalVigente({ ...ct, inicio: '2026-05-01' }, hoje)).toBe(100);
    expect(mensalVigente({ ...ct, mensal_desconto_recorrente: true, inicio: '2026-01-01' }, hoje)).toBe(90);
  });
});
