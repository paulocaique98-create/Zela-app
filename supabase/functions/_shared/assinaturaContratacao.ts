import { planoAssinatura } from './zelaBilling.ts';

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Asaas = any;

export type ResultadoAssinatura =
  | { ok: true; id: string; origem: 'ja_existia' | 'adotada' | 'criada'; proximo_vencimento?: string }
  | { ok: false; motivo: string };

function amanhaISO(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

// Cria a assinatura do Mensal DEPOIS que a 1ª parcela foi paga (a contratação já está ativa), para a 2ª cobrança
// não existir antes da 1ª. Idempotente em três camadas, então pode ser chamada de novo sem duplicar:
//  1) a contratação já tem asaas_subscription_id: não faz nada;
//  2) o Asaas já tem uma assinatura com externalReference contratacao:<id> (criada e não gravada): adota essa;
//  3) corrida entre duas chamadas: o UPDATE só grava se asaas_subscription_id ainda é nulo; quem perde a corrida
//     cancela a assinatura que acabou de criar e devolve a do vencedor.
export async function garantirAssinaturaContratacao(adminClient: Db, asaas: Asaas, contratacaoId: string): Promise<ResultadoAssinatura> {
  const { data: ct } = await adminClient.from('school_contratacoes')
    .select('id, school_id, status, asaas_subscription_id, condicao_chave, pagamento, primeiro_vencimento, parcelas')
    .eq('id', contratacaoId).maybeSingle();
  if (!ct) return { ok: false, motivo: 'Contratação não encontrada.' };
  if (ct.asaas_subscription_id) return { ok: true, id: ct.asaas_subscription_id, origem: 'ja_existia' };
  if (ct.pagamento !== 'mes_a_mes') return { ok: false, motivo: 'Só o Mensal tem assinatura.' };
  if (ct.status !== 'ativa') return { ok: false, motivo: `Contratação ${ct.status}: a assinatura só nasce depois da 1ª parcela paga.` };

  const gravar = async (id: string) => {
    const { data: gravada, error } = await adminClient.from('school_contratacoes')
      .update({ asaas_subscription_id: id }).eq('id', ct.id).is('asaas_subscription_id', null).select('id');
    if (error) throw error;
    return (gravada?.length ?? 0) > 0;
  };
  const vencedora = async () => {
    const { data: atual } = await adminClient.from('school_contratacoes').select('asaas_subscription_id').eq('id', ct.id).single();
    return atual?.asaas_subscription_id as string;
  };

  const ref = `contratacao:${ct.id}`;
  const existentes = await asaas.listSubscriptionsByReference(ref);
  const viva = (existentes?.data || []).find((x: { deleted?: boolean; status?: string }) => !x.deleted && x.status !== 'INACTIVE');
  if (viva) {
    await gravar(viva.id);
    return { ok: true, id: (await vencedora()) || viva.id, origem: 'adotada' };
  }

  const { data: p1 } = await adminClient.from('zela_cobrancas')
    .select('valor_sistema, asaas_customer_id').eq('contratacao_id', ct.id).eq('tipo', 'parcela').eq('numero', 1).single();
  const { data: cond } = await adminClient.from('zela_condicoes_pagamento').select('intervalo_meses').eq('chave', ct.condicao_chave).single();
  const { data: cfg } = await adminClient.from('zela_config_comercial').select('multa_percent, juros_mensal_percent').eq('id', true).single();
  if (!p1?.asaas_customer_id || !cond || !cfg || !ct.primeiro_vencimento) {
    return { ok: false, motivo: 'Dados da contratação incompletos (cliente Asaas, condição, configuração ou 1º vencimento).' };
  }

  const plano = planoAssinatura({
    primeiroVencimento: ct.primeiro_vencimento, parcelas: ct.parcelas ?? 1,
    intervaloMeses: cond.intervalo_meses, valorSistema: p1.valor_sistema,
  });
  const nextDueDate = plano.nextDueDate > amanhaISO() ? plano.nextDueDate : amanhaISO();
  const sub = await asaas.createSubscription({
    customer: p1.asaas_customer_id, billingType: 'BOLETO', value: plano.value, nextDueDate,
    cycle: plano.cycle, description: 'Zela Edu: assinatura', externalReference: ref,
    fine: { value: Number(cfg.multa_percent) }, interest: { value: Number(cfg.juros_mensal_percent) },
  });
  let gravou = false;
  try {
    gravou = await gravar(sub.id);
  } catch (e) {
    await asaas.cancelSubscription(sub.id).catch(() => {});
    throw e;
  }
  if (!gravou) {
    await asaas.cancelSubscription(sub.id).catch(() => {});
    return { ok: true, id: await vencedora(), origem: 'ja_existia' };
  }
  return { ok: true, id: sub.id, origem: 'criada', proximo_vencimento: nextDueDate };
}
