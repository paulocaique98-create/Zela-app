import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { proximoStatus, statusLocalDoAsaas, tokenConfere, valorConfere } from '../_shared/zelaBilling.ts';

// Faturamento do Zela Edu (PLANO_FATURAMENTO_ZELA.md, item 7): webhook da conta OFICIAL do Zela no Asaas
// (cobranças da escola ao Zela). Separado do payment-webhook, que trata escola -> família.
// Quem chama é o servidor do Asaas, por isso verify_jwt = false (supabase/config.toml) e a autenticidade
// vem do secret ZELA_BILLING_WEBHOOK_TOKEN (header asaas-access-token), comparado em tempo constante.
// Sem CORS de propósito: chamada servidor a servidor.
//
// O conteúdo do evento só diz QUAL pagamento consultar: status, valor e vencimento vêm sempre do
// GET /v3/payments/{id} na conta do Zela, e o externalReference precisa ser o id da cobrança local.
// Idempotência: o id do evento entra em zela_billing_eventos antes de processar; se o processamento
// falha, a linha sai e respondemos 500 para o Asaas reenviar.

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

serve(async (req) => {
  if (req.method !== 'POST') return resp(405, { error: 'Method not allowed' });

  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let eventoGravado: string | null = null;

  try {
    const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconhecido';
    const { data: ipOk, error: ipErr } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:zela-billing-webhook:ip:${clientIp}`, p_limit: 600, p_window_seconds: 300,
    });
    if (ipErr) console.error('[zela-billing-webhook] rate limit:', ipErr);
    else if (ipOk === false) return resp(429, { error: 'Rate limit excedido' });

    const esperado = Deno.env.get('ZELA_BILLING_WEBHOOK_TOKEN') || '';
    if (!tokenConfere(req.headers.get('asaas-access-token') || '', esperado)) return resp(401, { error: 'Unauthorized' });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return resp(400, { error: 'Invalid JSON body' });
    const eventId = body.id;
    const evento = body.event;
    const paymentId = body.payment?.id;
    if (typeof eventId !== 'string' || typeof evento !== 'string') return resp(400, { error: 'Campos obrigatórios: id, event' });
    if (typeof paymentId !== 'string' || !paymentId) return resp(200, { received: true, ignorado: 'sem pagamento' });

    const COLUNAS_COBRANCA = 'id, school_id, contratacao_id, status, valor, asaas_payment_id';
    let { data: cb } = await adminClient.from('zela_cobrancas')
      .select(COLUNAS_COBRANCA).eq('asaas_payment_id', paymentId).maybeSingle();
    // Cobrança gerada pela assinatura do Asaas (Mensal e renovação): ainda não existe linha local.
    // O id da assinatura do evento só diz qual contratação procurar; tudo é conferido no GET do pagamento.
    const subscriptionId = body.payment?.subscription;
    if (!cb && typeof subscriptionId === 'string' && subscriptionId) {
      const { data: ctSub } = await adminClient.from('school_contratacoes')
        .select('id, school_id, status').eq('asaas_subscription_id', subscriptionId).maybeSingle();
      if (ctSub) {
        if (!['aguardando_pagamento', 'ativa', 'suspensa'].includes(ctSub.status)) {
          await logEdgeError(adminClient, 'zela-billing-webhook', `Cobrança de assinatura de contratação ${ctSub.status} ignorada.`, { paymentId, subscriptionId }, ctSub.school_id);
          return resp(200, { received: true, ignorado: 'contratação encerrada' });
        }
        const apiKeyAss = Deno.env.get('ZELA_ASAAS_API_KEY');
        if (!apiKeyAss) throw new Error('ZELA_ASAAS_API_KEY não configurada.');
        const asaasPag = await createAsaasClient(apiKeyAss).getPayment(paymentId);
        if (!asaasPag?.id || asaasPag.id !== paymentId || asaasPag.subscription !== subscriptionId || !(Number(asaasPag.value) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(asaasPag.dueDate || '')) {
          await logEdgeError(adminClient, 'zela-billing-webhook', 'Pagamento da assinatura não confere.', { paymentId, subscriptionId }, ctSub.school_id);
          return resp(200, { received: true, ignorado: 'não confere' });
        }
        const { data: ultima } = await adminClient.from('zela_cobrancas').select('numero')
          .eq('contratacao_id', ctSub.id).eq('tipo', 'parcela').order('numero', { ascending: false }).limit(1).maybeSingle();
        const { data: nova, error: insErr } = await adminClient.from('zela_cobrancas').insert({
          school_id: ctSub.school_id, contratacao_id: ctSub.id, tipo: 'parcela', numero: (ultima?.numero ?? 0) + 1,
          competencia: `${asaasPag.dueDate.slice(0, 7)}-01`, vencimento: asaasPag.dueDate,
          valor_sistema: asaasPag.value, valor_implantacao: 0,
          asaas_customer_id: asaasPag.customer ?? null, asaas_payment_id: paymentId, invoice_url: asaasPag.invoiceUrl ?? null,
        }).select(COLUNAS_COBRANCA).single();
        // Corrida entre dois eventos (numero ou asaas_payment_id repetido): 500 faz o Asaas reenviar e o retry resolve.
        if (insErr) throw insErr;
        cb = nova;
      }
    }

    // Registro do evento já com o id da cobrança (evento de cobrança nova de assinatura vem sem linha antes).

    const { error: evErr } = await adminClient.from('zela_billing_eventos').insert({
      event_id: eventId, evento, asaas_payment_id: paymentId, cobranca_id: cb?.id ?? null, payload: body,
    });
    if (evErr) {
      if (evErr.code === '23505') return resp(200, { received: true, duplicate: true });
      throw evErr;
    }
    eventoGravado = eventId;

    // Pagamento que não é de cobrança do Zela (ex.: teste do painel): guardado e ignorado.
    if (!cb) return resp(200, { received: true, ignorado: 'cobrança desconhecida' });

    const apiKey = Deno.env.get('ZELA_ASAAS_API_KEY');
    if (!apiKey) throw new Error('ZELA_ASAAS_API_KEY não configurada.');
    const pagamento = await createAsaasClient(apiKey).getPayment(paymentId);
    // Cobrança avulsa: externalReference é o id local. Cobrança de assinatura: vale se a assinatura é a da contratação.
    let doContrato = pagamento?.externalReference === cb.id;
    if (!doContrato && pagamento?.subscription) {
      const { data: ctDono } = await adminClient.from('school_contratacoes').select('asaas_subscription_id').eq('id', cb.contratacao_id).single();
      doContrato = !!ctDono?.asaas_subscription_id && ctDono.asaas_subscription_id === pagamento.subscription;
    }
    if (!pagamento?.id || pagamento.id !== paymentId || !doContrato) {
      await logEdgeError(adminClient, 'zela-billing-webhook', 'Pagamento não confere com a cobrança local.', { paymentId, cobranca_id: cb.id }, cb.school_id);
      return resp(200, { received: true, ignorado: 'não confere' });
    }

    const novo = proximoStatus(cb.status, statusLocalDoAsaas(pagamento.status, pagamento.deleted));
    if (!novo) return resp(200, { received: true, sem_mudanca: true });

    if (novo === 'paga' && !valorConfere(cb.valor, pagamento.value)) {
      await logEdgeError(adminClient, 'zela-billing-webhook', 'Valor pago diferente do valor da cobrança; baixa não aplicada.', {
        paymentId, esperado: cb.valor, recebido: pagamento.value,
      }, cb.school_id);
      throw new Error('Valor divergente: a cobrança não foi baixada.');
    }

    const upd: Record<string, unknown> = { status: novo };
    if (pagamento.invoiceUrl) upd.invoice_url = pagamento.invoiceUrl;
    if (novo === 'paga') upd.paga_em = pagamento.paymentDate ? `${pagamento.paymentDate}T12:00:00Z` : new Date().toISOString();
    const { error: updErr } = await adminClient.from('zela_cobrancas').update(upd).eq('id', cb.id).eq('status', cb.status);
    if (updErr) throw updErr;

    if (novo === 'paga') {
      const { data: ct } = await adminClient.from('school_contratacoes').select('status').eq('id', cb.contratacao_id).single();
      let ativar = ct?.status === 'aguardando_pagamento';
      if (ct?.status === 'suspensa') {
        const { count } = await adminClient.from('zela_cobrancas').select('id', { count: 'exact', head: true })
          .eq('contratacao_id', cb.contratacao_id).eq('status', 'vencida');
        ativar = (count ?? 0) === 0;
      }
      if (ativar) {
        const { error: ativErr } = await adminClient.rpc('zela_ativar_contratacao', { p_contratacao_id: cb.contratacao_id });
        if (ativErr) throw ativErr;
      }
    }
    // Suspensão por atraso é da função agendada (etapa D): aqui OVERDUE só marca a cobrança como vencida.

    return resp(200, { received: true, status: novo });
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    console.error('[zela-billing-webhook]', msg);
    try {
      if (eventoGravado) await adminClient.from('zela_billing_eventos').delete().eq('event_id', eventoGravado);
      await logEdgeError(adminClient, 'zela-billing-webhook', msg);
    } catch (_) { /* melhor esforço */ }
    return resp(500, { error: 'Internal error' });
  }
});
