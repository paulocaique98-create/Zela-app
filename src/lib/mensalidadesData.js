import { supabase } from './supabase';
import { avaliarMensalidadeDoAluno, calcularValorDoCiclo, procurarPreco, planoDoAluno, valorMensalEquivalente, ROTULO_PERIODICIDADE } from '../../supabase/functions/_shared/planPricing.ts';

// Dados da Gestão para Planos e Mensalidades (04/10/2026): alunos ativos com
// ciclo e turno, tabela de preços, responsável financeiro de cada aluno,
// condição da família (bolsista e desconto) e quem já tem mensalidade ativa.
// Tudo por escola; a RLS já limita à escola da Gestão.

export async function carregarContextoDeMensalidades(schoolId) {
  const consultas = await Promise.all([
    supabase.from('students').select('id, name, contracted_hours, turno, turma, family_id').eq('school_id', schoolId).eq('enrollment_status', 'ativo').order('name'),
    supabase.from('school_plan_prices').select('id, school_year, ciclo_horas, turno, monthly_amount_cents').eq('school_id', schoolId),
    supabase.from('financial_contracts').select('student_id').eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('student_guardians').select('student_id, guardian_id').eq('school_id', schoolId).eq('is_financial', true),
    supabase.from('financial_guardian_conditions').select('guardian_id, bolsista').eq('school_id', schoolId),
    supabase.from('financial_billing_discounts').select('guardian_id, billing_cycle, discount_percent').eq('school_id', schoolId),
  ]);
  const falha = consultas.find(c => c.error);
  if (falha) throw new Error(falha.error.message);
  const [alunos, precos, contratos, vinculos, condicoes, descontos] = consultas.map(c => c.data || []);

  const idsResponsaveis = [...new Set(vinculos.map(v => v.guardian_id))];
  let responsaveis = [];
  if (idsResponsaveis.length) {
    const { data, error } = await supabase.from('users').select('id, name, doc_number').in('id', idsResponsaveis);
    if (error) throw new Error(error.message);
    responsaveis = data || [];
  }
  return { alunos, precos, contratos, vinculos, condicoes, descontos, responsaveis };
}

// Uma linha por aluno ativo, já avaliada (ver avaliarMensalidadeDoAluno).
export function montarLinhasDeMensalidade(ctx, { ano, periodicidade = 'MONTHLY' }) {
  const comContrato = new Set(ctx.contratos.map(c => c.student_id));
  const responsavelDoAluno = new Map(ctx.vinculos.map(v => [v.student_id, v.guardian_id]));
  const usuario = new Map(ctx.responsaveis.map(u => [u.id, u]));
  const bolsistas = new Set(ctx.condicoes.filter(c => c.bolsista).map(c => c.guardian_id));
  const desconto = (guardianId) => Number(ctx.descontos.find(d => d.guardian_id === guardianId && d.billing_cycle === periodicidade)?.discount_percent ?? 0);

  return ctx.alunos.map((aluno) => {
    const guardianId = responsavelDoAluno.get(aluno.id) || null;
    const responsavel = guardianId ? usuario.get(guardianId) : null;
    const avaliacao = avaliarMensalidadeDoAluno({
      aluno, precos: ctx.precos, ano,
      temContratoAtivo: comContrato.has(aluno.id),
      temResponsavel: Boolean(guardianId),
      responsavelTemDocumento: Boolean(responsavel?.doc_number),
      bolsista: guardianId ? bolsistas.has(guardianId) : false,
      descontoPercent: guardianId ? desconto(guardianId) : 0,
      periodicidade,
    });
    return { aluno, guardianId, responsavelNome: responsavel?.name || '', ...avaliacao };
  });
}

// Quantos alunos ativos há em cada ciclo e turno, e quantos estão sem plano.
export function contarAlunosPorPlano(alunos) {
  const contagem = new Map();
  let semPlano = 0;
  for (const a of alunos) {
    const { ciclo, turno } = planoDoAluno(a);
    if (!ciclo || !turno) { semPlano += 1; continue; }
    const chave = `${ciclo}|${turno}`;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return { contagem, semPlano };
}

// Campos de preço do contrato em documento (04/10/2026). Sai da mensalidade
// ativa do aluno; sem ela, da tabela de Planos com o desconto mensal da
// família; família bolsista sai como "bolsa integral". Vazio = sem como saber
// (o campo continua {{...}} para a escola preencher na hora de gerar).
export function valoresDePrecoDoContrato({ contrato, bolsista, precos, ano, aluno, descontoMensalPercent, formatarData, formatarMoeda }) {
  const plano = planoDoAluno({ contracted_hours: contrato?.ciclo_horas ?? aluno?.contracted_hours, turno: contrato?.turno ?? aluno?.turno });
  const comum = {
    plano_ciclo: plano.ciclo ? `${plano.ciclo} horas` : '',
    plano_turno: plano.turno || '',
  };
  if (bolsista) {
    return { ...comum, valor_mensal: 'bolsa integral (sem cobrança)', primeiro_vencimento: 'não se aplica', periodicidade: '', valor_parcela: '', valor_mensal_equivalente: '', valor_anual: '', desconto_familia: '' };
  }
  const periodicidade = contrato?.billing_cycle || 'MONTHLY';
  let mensal = null;
  if (contrato?.amount_cents) mensal = valorMensalEquivalente(contrato.amount_cents, periodicidade);
  else {
    const tabela = procurarPreco(precos, ano, plano.ciclo, plano.turno);
    mensal = tabela === null ? null : calcularValorDoCiclo(tabela, 'MONTHLY', descontoMensalPercent || 0);
  }
  return {
    ...comum,
    valor_mensal: mensal ? formatarMoeda(mensal) : '',
    primeiro_vencimento: contrato?.first_due_date ? formatarData(contrato.first_due_date) : '',
    periodicidade: contrato ? ROTULO_PERIODICIDADE[periodicidade].toLowerCase() : '',
    valor_parcela: contrato?.amount_cents ? formatarMoeda(contrato.amount_cents) : '',
    valor_mensal_equivalente: mensal ? formatarMoeda(mensal) : '',
    valor_anual: mensal ? formatarMoeda(mensal * 12) : '',
    desconto_familia: contrato ? `${Number(contrato.discount_percent_applied) || 0}%` : (mensal ? `${descontoMensalPercent || 0}%` : ''),
  };
}

// Frase para a Gestão depois de aprovar uma matrícula com a criação
// automática possivelmente ligada. '' = nada a dizer (desligada).
export function resumoDaCriacaoAutomatica(resposta) {
  if (!resposta || resposta.desligada) return '';
  if (resposta.semGateway) return 'Matrícula aprovada. A escola ainda não tem conta Asaas, então a mensalidade não foi criada.';
  const resultados = resposta.resultados || [];
  const criadas = resultados.filter(r => r.ok).length;
  const aguardando = resultados.filter(r => !r.ok && r.pulado && r.codigo !== 'ja_tem' && r.codigo !== 'bolsista').length;
  const falhas = resultados.filter(r => !r.ok && !r.pulado).length;
  const partes = [];
  if (criadas) partes.push(`${criadas} ${criadas === 1 ? 'mensalidade criada' : 'mensalidades criadas'} automaticamente`);
  if (aguardando) partes.push(`${aguardando} ${aguardando === 1 ? 'aguarda' : 'aguardam'} em Financeiro · Mensalidades (falta preço, ciclo, turno ou CPF)`);
  if (falhas) partes.push(`${falhas} ${falhas === 1 ? 'não pôde ser criada' : 'não puderam ser criadas'}: crie em Financeiro · Mensalidades`);
  return partes.length ? `Matrícula aprovada. ${partes.join(' · ')}.` : '';
}
