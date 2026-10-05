import { calcularValorDoCiclo, planoDoAluno, procurarPreco, anoDoPreco, mensagemSemPreco, CICLO_MESES } from './planPricing.ts';
import type { PeriodicidadeDeCobranca } from './planPricing.ts';

// Criação de uma mensalidade (contrato financeiro + assinatura no Asaas),
// usada pela criação avulsa (create-financial-contract) e em lote
// (create-financial-contracts-batch, inclusive a criação automática na
// aprovação da matrícula). Uma regra só para os dois caminhos.
//
// Padrão "reserva-antes-de-chamar-o-gateway" (Fase 4, risco 6.6): a linha em
// financial_contracts é inserida ANTES de qualquer chamada ao Asaas — o índice
// único parcial (1 contrato 'active' por aluno) é a trava atômica contra
// corrida, sem nunca criar assinatura órfã no Asaas. Se o Asaas falhar
// DEPOIS da reserva, o contrato vira 'cancelled' (nunca é apagado: trilha de
// auditoria) e o erro volta para quem chamou.
//
// Preço (04/10/2026): sem base_monthly_amount_cents, o servidor usa a tabela
// de Planos (ciclo e turno do aluno, ano do 1º vencimento). Com valor
// digitado, a mensalidade fica marcada como 'manual'. O valor final é SEMPRE
// calculado aqui, nunca aceito da tela (risco 6.10).

// Motivos que não são erro de sistema: o aluno simplesmente não pode ter
// mensalidade criada agora (a criação automática só pula, sem alarme).
export type CodigoDeMensalidade =
  | 'sem_plano' | 'sem_preco' | 'sem_responsavel' | 'sem_documento' | 'bolsista' | 'ja_tem' | 'dados_invalidos' | 'sem_gateway';

export const CODIGOS_QUE_PULAM: CodigoDeMensalidade[] = ['sem_plano', 'sem_preco', 'sem_responsavel', 'sem_documento', 'bolsista', 'ja_tem'];

export class MensalidadeError extends Error {
  code: CodigoDeMensalidade | 'gateway';
  constructor(code: CodigoDeMensalidade | 'gateway', message: string) {
    super(message);
    this.code = code;
  }
}

export interface NovaMensalidade {
  student_id: string;
  billing_cycle: string;
  first_due_date: string;
  billing_type?: string;
  description?: string;
  base_monthly_amount_cents?: number | null;
  school_year?: number | null;
}

// deno-lint-ignore no-explicit-any
type Cliente = any;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Chave Asaas da escola (Opção A: cada escola tem a própria conta).
export async function criarClienteAsaas(adminClient: Cliente, schoolId: string, criar: (chave: string) => unknown) {
  const { data: apiKey, error } = await adminClient.rpc('get_school_gateway_secret', { p_school_id: schoolId, p_gateway: 'asaas' });
  if (error) throw error;
  if (!apiKey) throw new MensalidadeError('sem_gateway', 'Esta escola ainda não tem uma conta Asaas configurada.');
  return criar(apiKey);
}

export async function criarMensalidade(
  adminClient: Cliente,
  contexto: { schoolId: string; callerId: string; asaas: Cliente },
  entrada: NovaMensalidade,
) {
  const { schoolId, callerId, asaas } = contexto;
  const { student_id, billing_cycle, first_due_date } = entrada;
  if (!student_id || !billing_cycle || !first_due_date) {
    throw new MensalidadeError('dados_invalidos', 'Campos obrigatórios: student_id, billing_cycle, first_due_date');
  }
  if (!Object.keys(CICLO_MESES).includes(billing_cycle)) {
    throw new MensalidadeError('dados_invalidos', 'billing_cycle deve ser MONTHLY, QUARTERLY, SEMIANNUALLY ou YEARLY');
  }
  if (!DATA.test(first_due_date)) throw new MensalidadeError('dados_invalidos', 'O 1º vencimento precisa ser uma data válida.');
  const paymentBillingType = entrada.billing_type || 'UNDEFINED';
  if (!['PIX', 'BOLETO', 'UNDEFINED'].includes(paymentBillingType)) {
    // Mesma restrição da Fase 7: nunca CREDIT_CARD com dado de cartão
    // passando pelo nosso backend — só checkout hospedado.
    throw new MensalidadeError('dados_invalidos', 'billing_type deve ser PIX, BOLETO ou UNDEFINED');
  }
  const manual = entrada.base_monthly_amount_cents;
  if (manual !== undefined && manual !== null && (!Number.isInteger(manual) || manual <= 0)) {
    throw new MensalidadeError('dados_invalidos', 'Valor mensal inválido.');
  }

  // Nunca confia em school_id vindo do client — o aluno tem que ser
  // realmente da escola de quem está chamando (Fase 4, risco 6.5/6.9).
  const { data: student, error: studentError } = await adminClient
    .from('students')
    .select('id, name, school_id, contracted_hours, turno')
    .eq('id', student_id)
    .eq('school_id', schoolId)
    .single();
  if (studentError || !student) throw new Error('Aluno não encontrado nesta escola.');

  // Responsável financeiro ATUAL (Fase 6: is_financial=true é a fonte da verdade).
  const { data: guardianLink, error: guardianLinkError } = await adminClient
    .from('student_guardians')
    .select('guardian_id')
    .eq('student_id', student_id)
    .eq('is_financial', true)
    .maybeSingle();
  if (guardianLinkError) throw guardianLinkError;
  if (!guardianLink) {
    throw new MensalidadeError('sem_responsavel', 'Este aluno não tem um responsável financeiro definido. Defina um em Alunos › Responsáveis antes de criar a mensalidade.');
  }

  const { data: guardian, error: guardianError } = await adminClient
    .from('users')
    .select('id, name, email, doc_number, doc_type')
    .eq('id', guardianLink.guardian_id)
    .single();
  if (guardianError || !guardian) throw new Error('Responsável financeiro não encontrado.');

  // Bolsista não recebe cobrança (decisão de 04/10/2026).
  const { data: condicao } = await adminClient
    .from('financial_guardian_conditions')
    .select('bolsista')
    .eq('school_id', schoolId)
    .eq('guardian_id', guardian.id)
    .maybeSingle();
  if (condicao?.bolsista) {
    throw new MensalidadeError('bolsista', `${guardian.name} está como bolsista: não gera cobrança.`);
  }

  if (!guardian.doc_number) {
    throw new MensalidadeError('sem_documento', 'O responsável financeiro não tem CPF/CNPJ cadastrado — obrigatório para criar a cobrança no Asaas.');
  }

  // Preço mensal: tabela de Planos (ciclo e turno do aluno) ou valor digitado.
  const plano = planoDoAluno(student);
  const ano = anoDoPreco(first_due_date, entrada.school_year);
  let baseMensal: number;
  let origemDoPreco: 'tabela' | 'manual';
  if (manual !== undefined && manual !== null) {
    baseMensal = manual;
    origemDoPreco = 'manual';
  } else {
    if (!plano.ciclo || !plano.turno) {
      throw new MensalidadeError('sem_plano', `${student.name} está sem ${plano.faltando.join(' e sem ')} no cadastro. Complete em Financeiro › Planos.`);
    }
    const { data: precos, error: precosError } = await adminClient
      .from('school_plan_prices')
      .select('school_year, ciclo_horas, turno, monthly_amount_cents')
      .eq('school_id', schoolId)
      .eq('school_year', ano);
    if (precosError) throw precosError;
    const achado = procurarPreco(precos, ano, plano.ciclo, plano.turno);
    if (achado === null) throw new MensalidadeError('sem_preco', mensagemSemPreco(plano.ciclo, plano.turno, ano));
    baseMensal = achado;
    origemDoPreco = 'tabela';
  }

  // Desconto da família, por responsável e periodicidade — sempre recalculado aqui.
  const { data: discountRow } = await adminClient
    .from('financial_billing_discounts')
    .select('discount_percent')
    .eq('school_id', schoolId)
    .eq('guardian_id', guardian.id)
    .eq('billing_cycle', billing_cycle)
    .maybeSingle();
  const discountPercent = Number(discountRow?.discount_percent ?? 0);
  const amountCents = calcularValorDoCiclo(baseMensal, billing_cycle as PeriodicidadeDeCobranca, discountPercent);
  if (!(amountCents > 0)) throw new MensalidadeError('dados_invalidos', 'O valor final da mensalidade ficou zerado.');

  // ── Reserva: insere ANTES de chamar o Asaas ──────────────────────────
  const { data: contract, error: insertError } = await adminClient
    .from('financial_contracts')
    .insert({
      school_id: schoolId,
      student_id,
      financial_guardian_id: guardian.id,
      billing_cycle,
      base_monthly_amount_cents: baseMensal,
      discount_percent_applied: discountPercent,
      amount_cents: amountCents,
      first_due_date,
      status: 'active',
      gateway: 'asaas',
      created_by: callerId,
      ciclo_horas: plano.ciclo,
      turno: plano.turno,
      school_year: ano,
      price_source: origemDoPreco,
    })
    .select('id')
    .single();
  if (insertError) {
    if (insertError.code === '23505') {
      throw new MensalidadeError('ja_tem', 'Este aluno já tem um contrato financeiro ativo. Cancele o contrato atual antes de criar um novo.');
    }
    throw insertError;
  }
  const contractId: string = contract.id;

  try {
    const customer = await asaas.createCustomer({
      name: guardian.name,
      cpfCnpj: guardian.doc_number,
      email: guardian.email || undefined,
    });
    const subscription = await asaas.createSubscription({
      customer: customer.id,
      billingType: paymentBillingType,
      value: amountCents / 100,
      nextDueDate: first_due_date,
      cycle: billing_cycle,
      description: entrada.description || `Mensalidade — ${student.name}`,
      externalReference: contractId,
    });
    const { error: updateError } = await adminClient
      .from('financial_contracts')
      .update({ gateway_customer_id: customer.id, gateway_subscription_id: subscription.id, updated_at: new Date().toISOString() })
      .eq('id', contractId);
    if (updateError) throw updateError;
    return {
      contract_id: contractId,
      gateway_customer_id: customer.id as string,
      gateway_subscription_id: subscription.id as string,
      amount_cents: amountCents,
      billing_cycle,
      discount_percent_applied: discountPercent,
      base_monthly_amount_cents: baseMensal,
      price_source: origemDoPreco,
    };
  } catch (err) {
    // O Asaas falhou depois da reserva: marca 'cancelled' (nunca apaga) e
    // libera o aluno para uma nova tentativa.
    await adminClient.from('financial_contracts').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', contractId);
    throw new MensalidadeError('gateway', (err as Error).message || 'Falha ao criar a assinatura no Asaas.');
  }
}
