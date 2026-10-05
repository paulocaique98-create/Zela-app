import { describe, it, expect } from 'vitest';
import {
  montarLinhasDeMensalidade, contarAlunosPorPlano, valoresDePrecoDoContrato, resumoDaCriacaoAutomatica,
} from './mensalidadesData.js';
import { centsToBRL, formatDateBR } from './gestaoUtils.js';

const ctx = {
  alunos: [
    { id: 'a1', name: 'Ana', contracted_hours: 6, turno: 'Matutino' },
    { id: 'a2', name: 'Bia', contracted_hours: 8, turno: 'Vespertino' },
    { id: 'a3', name: 'Caio', contracted_hours: 6, turno: 'Matutino' },
    { id: 'a4', name: 'Duda', contracted_hours: null, turno: 'Matutino' },
    { id: 'a5', name: 'Edu', contracted_hours: 10, turno: 'Vespertino' },
  ],
  precos: [
    { school_year: 2026, ciclo_horas: 6, turno: 'Matutino', monthly_amount_cents: 120000 },
    { school_year: 2026, ciclo_horas: 8, turno: 'Vespertino', monthly_amount_cents: 150000 },
  ],
  contratos: [{ student_id: 'a2' }],
  vinculos: [{ student_id: 'a1', guardian_id: 'g1' }, { student_id: 'a2', guardian_id: 'g2' }, { student_id: 'a3', guardian_id: 'g3' }, { student_id: 'a5', guardian_id: 'g1' }],
  condicoes: [{ guardian_id: 'g3', bolsista: true }],
  descontos: [
    { guardian_id: 'g1', billing_cycle: 'MONTHLY', discount_percent: '10.00' },
    { guardian_id: 'g1', billing_cycle: 'QUARTERLY', discount_percent: '5.00' },
  ],
  responsaveis: [{ id: 'g1', name: 'Mãe da Ana', doc_number: '123' }, { id: 'g2', name: 'Pai da Bia', doc_number: '456' }, { id: 'g3', name: 'Mãe do Caio', doc_number: '789' }],
};

describe('mensalidades · lista da Gestão', () => {
  it('cada aluno ativo recebe a situação certa, com preço e desconto da família', () => {
    const linhas = montarLinhasDeMensalidade(ctx, { ano: 2026 });
    const por = Object.fromEntries(linhas.map(l => [l.aluno.id, l]));
    expect(por.a1).toMatchObject({ situacao: 'pronto', mensalCents: 120000, valorDoCicloCents: 108000, responsavelNome: 'Mãe da Ana' });
    expect(por.a2.situacao).toBe('ja_tem');
    expect(por.a3.situacao).toBe('bolsista');
    expect(por.a4.situacao).toBe('sem_plano');
    expect(por.a5.situacao).toBe('sem_preco');
  });

  it('a periodicidade muda o desconto e o valor de cada cobrança', () => {
    const tri = montarLinhasDeMensalidade(ctx, { ano: 2026, periodicidade: 'QUARTERLY' }).find(l => l.aluno.id === 'a1');
    expect(tri).toMatchObject({ situacao: 'pronto', descontoPercent: 5, valorDoCicloCents: 342000 });
    const anual = montarLinhasDeMensalidade(ctx, { ano: 2026, periodicidade: 'YEARLY' }).find(l => l.aluno.id === 'a1');
    expect(anual.descontoPercent).toBe(0);
    expect(anual.valorDoCicloCents).toBe(1440000);
  });

  it('ano sem tabela e responsável sem CPF ou sem vínculo', () => {
    expect(montarLinhasDeMensalidade(ctx, { ano: 2027 }).find(l => l.aluno.id === 'a1').situacao).toBe('sem_preco');
    const semCpf = { ...ctx, responsaveis: ctx.responsaveis.map(r => (r.id === 'g1' ? { ...r, doc_number: null } : r)) };
    expect(montarLinhasDeMensalidade(semCpf, { ano: 2026 }).find(l => l.aluno.id === 'a1').situacao).toBe('sem_documento');
    const semVinculo = { ...ctx, vinculos: [] };
    expect(montarLinhasDeMensalidade(semVinculo, { ano: 2026 }).find(l => l.aluno.id === 'a1').situacao).toBe('sem_responsavel');
  });

  it('contagem de alunos por ciclo e turno, e quantos estão sem plano', () => {
    const { contagem, semPlano } = contarAlunosPorPlano(ctx.alunos);
    expect(contagem.get('6|Matutino')).toBe(2);
    expect(contagem.get('8|Vespertino')).toBe(1);
    expect(contagem.get('10|Vespertino')).toBe(1);
    expect(semPlano).toBe(1);
  });
});

describe('contrato em documento · campos de preço', () => {
  const fmt = { formatarData: formatDateBR, formatarMoeda: centsToBRL };
  const aluno = { contracted_hours: 6, turno: 'Matutino' };
  const nbsp = (t) => t.replace(/ /g, ' ');
  const norm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nbsp(String(v))]));

  it('mensalidade mensal ativa: valor da cobrança é o valor por mês', () => {
    const v = norm(valoresDePrecoDoContrato({
      contrato: { amount_cents: 108000, billing_cycle: 'MONTHLY', first_due_date: '2026-11-10', discount_percent_applied: 10, ciclo_horas: 6, turno: 'Matutino' },
      bolsista: false, precos: [], ano: 2026, aluno, descontoMensalPercent: 10, ...fmt,
    }));
    expect(v).toMatchObject({ valor_mensal: 'R$ 1.080,00', primeiro_vencimento: '10/11/2026', periodicidade: 'mensal', valor_parcela: 'R$ 1.080,00', valor_anual: 'R$ 12.960,00', desconto_familia: '10%', plano_ciclo: '6 horas', plano_turno: 'Matutino' });
  });

  it('mensalidade trimestral: mensalidade é o equivalente por mês, não a cobrança de 3 meses', () => {
    const v = norm(valoresDePrecoDoContrato({
      contrato: { amount_cents: 342000, billing_cycle: 'QUARTERLY', first_due_date: '2026-11-10', discount_percent_applied: 5 },
      bolsista: false, precos: [], ano: 2026, aluno, descontoMensalPercent: 0, ...fmt,
    }));
    expect(v).toMatchObject({ valor_mensal: 'R$ 1.140,00', valor_parcela: 'R$ 3.420,00', periodicidade: 'trimestral', valor_mensal_equivalente: 'R$ 1.140,00', desconto_familia: '5%' });
  });

  it('sem mensalidade: usa a tabela com o desconto mensal e deixa o vencimento para preencher', () => {
    const v = norm(valoresDePrecoDoContrato({
      contrato: null, bolsista: false, ano: 2026, aluno, descontoMensalPercent: 10, ...fmt,
      precos: [{ school_year: 2026, ciclo_horas: 6, turno: 'Matutino', monthly_amount_cents: 120000 }],
    }));
    expect(v.valor_mensal).toBe('R$ 1.080,00');
    expect(v.primeiro_vencimento).toBe('');
    expect(v.valor_parcela).toBe('');
    const semTabela = valoresDePrecoDoContrato({ contrato: null, bolsista: false, precos: [], ano: 2026, aluno, descontoMensalPercent: 0, ...fmt });
    expect(semTabela.valor_mensal).toBe('');
  });

  it('família bolsista: bolsa integral, sem vencimento, mesmo com valores antigos', () => {
    const v = valoresDePrecoDoContrato({
      contrato: { amount_cents: 108000, billing_cycle: 'MONTHLY', first_due_date: '2026-11-10' }, bolsista: true, precos: [], ano: 2026, aluno, descontoMensalPercent: 0, ...fmt,
    });
    expect(v).toMatchObject({ valor_mensal: 'bolsa integral (sem cobrança)', primeiro_vencimento: 'não se aplica', plano_ciclo: '6 horas' });
    expect(v.valor_mensal).not.toContain('-');
  });
});

describe('aprovação de matrícula · resumo da criação automática', () => {
  it('desligada não diz nada; ligada resume o que foi feito', () => {
    expect(resumoDaCriacaoAutomatica({ desligada: true, resultados: [] })).toBe('');
    expect(resumoDaCriacaoAutomatica(null)).toBe('');
    expect(resumoDaCriacaoAutomatica({ semGateway: true, resultados: [] })).toContain('conta Asaas');
    expect(resumoDaCriacaoAutomatica({ resultados: [{ ok: true }, { ok: true }, { ok: false, pulado: true, codigo: 'sem_preco' }, { ok: false, pulado: true, codigo: 'ja_tem' }] }))
      .toBe('Matrícula aprovada. 2 mensalidades criadas automaticamente · 1 aguarda em Financeiro · Mensalidades (falta preço, ciclo, turno ou CPF).');
    expect(resumoDaCriacaoAutomatica({ resultados: [{ ok: false, pulado: false, codigo: 'gateway' }] })).toContain('1 não pôde ser criada');
    expect(resumoDaCriacaoAutomatica({ resultados: [{ ok: false, pulado: true, codigo: 'bolsista' }] })).toBe('');
    expect(resumoDaCriacaoAutomatica({ resultados: [{ ok: true }] })).not.toMatch(/ - /);
  });
});
