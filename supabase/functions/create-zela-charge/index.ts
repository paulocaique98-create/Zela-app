import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { montarPagamentoAsaas, planoAssinatura } from '../_shared/zelaBilling.ts';

// Faturamento do Zela Edu (PLANO_FATURAMENTO_ZELA.md, item 6): cobra a escola na conta OFICIAL do Zela no
// Asaas (secret ZELA_ASAAS_API_KEY, nunca a chave de uma escola). Só o developer chama, com o role lido do
// banco a partir do JWT. Nada vem do cliente além dos ids: valores, vencimentos e escola são lidos de
// zela_cobrancas / school_contratacoes, que já foram calculados no servidor pela RPC contratar_plano_escola.
//
// Ações (body.action):
//  - criar: gera no Asaas as cobranças da contratação que ainda não têm link. Idempotente: serve também
//    para "tentar de novo" (pula as que já têm asaas_payment_id).
//  - novo_vencimento: cobranca_id + vencimento. Asaas primeiro, depois a RPC (que valida estado e data).
//  - cancelar: cobranca_id. Cancela no Asaas e depois no banco.
//  - cancelar_contratacao: contratacao_id aguardando pagamento. Cancela os links abertos no Asaas e depois a contratação.
//  - marcar_paga: cobranca_id (+ comprovante). Baixa no Asaas (receiveInCash) e depois no banco.
// A assinatura do Asaas (só Mensal; o Anual tem valor travado até a renovação) é criada no fim de "criar", uma vez por contratação, e cancelada
// junto com a contratação. As cobranças que ela gera chegam pelo zela-billing-webhook.
// Suspender e reativar não passam por aqui: não dependem do Asaas e seguem pelas RPCs.

const json = (corsHeaders: Record<string, string>, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(corsHeaders, 401, { error: 'Sem token de autorização.' });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) return json(corsHeaders, 401, { error: 'Token inválido ou expirado.' });

    const { data: callerRow } = await adminClient.from('users').select('role').eq('id', caller.id).single();
    if (callerRow?.role !== 'developer') {
      return json(corsHeaders, 403, { error: 'Apenas o suporte (developer) pode gerenciar o faturamento do Zela.' });
    }

    const { data: rateOk, error: rateErr } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:create-zela-charge:${caller.id}`, p_limit: 60, p_window_seconds: 300,
    });
    if (rateErr) throw rateErr;
    if (!rateOk) return json(corsHeaders, 429, { error: 'Muitas operações em pouco tempo. Aguarde alguns minutos.' });

    const apiKey = Deno.env.get('ZELA_ASAAS_API_KEY');
    if (!apiKey) return json(corsHeaders, 500, { error: 'A chave do Asaas do Zela não está configurada no servidor.' });
    const asaas = createAsaasClient(apiKey);

    const body = await req.json().catch(() => null);
    const action = body?.action;

    // Cliente com o JWT do developer: as RPCs de ação conferem o role por auth.uid().
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    if (action === 'criar') {
      const contratacaoId = body?.contratacao_id;
      if (typeof contratacaoId !== 'string' || !UUID.test(contratacaoId)) return json(corsHeaders, 400, { error: 'contratacao_id inválido.' });

      const { data: ct } = await adminClient.from('school_contratacoes')
        .select('id, school_id, status, asaas_subscription_id, condicao_chave, pagamento, primeiro_vencimento, parcelas')
        .eq('id', contratacaoId).maybeSingle();
      if (!ct) return json(corsHeaders, 404, { error: 'Contratação não encontrada.' });
      if (!['aguardando_pagamento', 'ativa', 'suspensa'].includes(ct.status)) {
        return json(corsHeaders, 409, { error: `Contratação com status ${ct.status} não gera cobranças.` });
      }

      const { data: escola } = await adminClient.from('schools')
        .select('id, name, cnpj, email, school_code').eq('id', ct.school_id).single();
      const cnpj = (escola?.cnpj || '').replace(/\D/g, '');
      if (cnpj.length !== 14) return json(corsHeaders, 422, { error: 'A escola não tem CNPJ válido cadastrado.' });
      if (!escola?.email) return json(corsHeaders, 422, { error: 'A escola não tem e-mail cadastrado.' });

      const { data: cobrancas, error: cobErr } = await adminClient.from('zela_cobrancas')
        .select('id, tipo, numero, vencimento, valor, status, asaas_payment_id, asaas_customer_id')
        .eq('contratacao_id', ct.id).order('tipo').order('numero');
      if (cobErr) throw cobErr;
      const parcelas = (cobrancas || []).filter(c => c.tipo === 'parcela');
      const pendentes = (cobrancas || []).filter(c => c.status === 'pendente' && !c.asaas_payment_id);

      const { data: cfg } = await adminClient.from('zela_config_comercial')
        .select('multa_percent, juros_mensal_percent').eq('id', true).single();
      if (!cfg) throw new Error('Configuração comercial do Zela não encontrada.');

      let customerId = (cobrancas || []).find(c => c.asaas_customer_id)?.asaas_customer_id as string | undefined;
      if (!customerId && pendentes.length > 0) {
        const { data: outras } = await adminClient.from('zela_cobrancas')
          .select('asaas_customer_id').eq('school_id', ct.school_id).not('asaas_customer_id', 'is', null).limit(1);
        customerId = outras?.[0]?.asaas_customer_id;
      }
      if (!customerId && pendentes.length > 0) {
        const cliente = await asaas.createCustomer({
          name: escola.name, cpfCnpj: cnpj, email: escola.email, externalReference: `escola:${escola.id}`,
        });
        customerId = cliente.id;
      }

      const criadas: Array<{ id: string; invoice_url: string | null }> = [];
      const falhas: Array<{ id: string; erro: string }> = [];
      for (const c of pendentes) {
        try {
          const pagamento = await asaas.createPayment(montarPagamentoAsaas(c, customerId!, cfg, parcelas.length));
          const invoiceUrl = pagamento.invoiceUrl ?? pagamento.bankSlipUrl ?? null;
          const { error: upErr } = await adminClient.from('zela_cobrancas')
            .update({ asaas_customer_id: customerId, asaas_payment_id: pagamento.id, invoice_url: invoiceUrl })
            .eq('id', c.id).is('asaas_payment_id', null);
          if (upErr) {
            // Cobrança criada no Asaas mas não gravada: cancela lá para não ficar órfã.
            await asaas.cancelPayment(pagamento.id).catch(() => {});
            throw upErr;
          }
          criadas.push({ id: c.id, invoice_url: invoiceUrl });
        } catch (e) {
          const erro = (e as Error)?.message || String(e);
          falhas.push({ id: c.id, erro });
          await logEdgeError(adminClient, 'create-zela-charge', erro, { cobranca_id: c.id }, ct.school_id);
        }
      }

      // Assinatura só no Mensal (sem fidelidade: o valor pode ser reajustado a qualquer momento, via
      // updateSubscription). No Anual NÃO existe assinatura: o valor é travado até o fim do contrato, e a
      // renovação é um contrato novo, já com o IPCA. Só depois de todas as cobranças iniciais terem link,
      // e só uma vez por contratação (asaas_subscription_id).
      // Falhar aqui não desfaz as cobranças: "tentar de novo" cai neste mesmo ponto.
      let assinatura: { id: string; proximo_vencimento: string } | null = null;
      let assinaturaErro: string | null = null;
      const iniciaisCompletas = !falhas.length && customerId && (cobrancas || []).every(c =>
        c.status === 'cancelada' ? true : !!c.asaas_payment_id || criadas.some(x => x.id === c.id));
      if (ct.pagamento === 'mes_a_mes' && !ct.asaas_subscription_id && iniciaisCompletas && parcelas.length > 0) {
        try {
          const { data: cond } = await adminClient.from('zela_condicoes_pagamento')
            .select('intervalo_meses').eq('chave', ct.condicao_chave).single();
          if (!cond || !ct.primeiro_vencimento) throw new Error('Condição de pagamento ou 1º vencimento ausente na contratação.');
          const { data: p1 } = await adminClient.from('zela_cobrancas')
            .select('valor_sistema').eq('contratacao_id', ct.id).eq('tipo', 'parcela').eq('numero', 1).single();
          const plano = planoAssinatura({
            primeiroVencimento: ct.primeiro_vencimento, parcelas: ct.parcelas ?? parcelas.length,
            intervaloMeses: cond.intervalo_meses, valorSistema: p1!.valor_sistema,
          });
          const sub = await asaas.createSubscription({
            customer: customerId!, billingType: 'BOLETO', value: plano.value, nextDueDate: plano.nextDueDate,
            cycle: plano.cycle, description: 'Zela Edu: assinatura', externalReference: `contratacao:${ct.id}`,
            fine: { value: Number(cfg.multa_percent) }, interest: { value: Number(cfg.juros_mensal_percent) },
          });
          const { error: subErr } = await adminClient.from('school_contratacoes')
            .update({ asaas_subscription_id: sub.id }).eq('id', ct.id).is('asaas_subscription_id', null);
          if (subErr) {
            // Criada no Asaas mas não gravada: cancela lá para não gerar cobrança sem dono.
            await asaas.cancelSubscription(sub.id).catch(() => {});
            throw subErr;
          }
          assinatura = { id: sub.id, proximo_vencimento: plano.nextDueDate };
        } catch (e) {
          assinaturaErro = (e as Error)?.message || String(e);
          await logEdgeError(adminClient, 'create-zela-charge', `Assinatura não criada: ${assinaturaErro}`, { contratacao_id: ct.id }, ct.school_id);
        }
      }

      const status = falhas.length && !criadas.length ? 502 : 200;
      return json(corsHeaders, status, {
        criadas, falhas, ja_existentes: (cobrancas || []).length - pendentes.length,
        assinatura, assinatura_erro: assinaturaErro, assinatura_ja_existia: !!ct.asaas_subscription_id,
      });
    }

    if (action === 'cancelar_contratacao') {
      const contratacaoId = body?.contratacao_id;
      if (typeof contratacaoId !== 'string' || !UUID.test(contratacaoId)) return json(corsHeaders, 400, { error: 'contratacao_id inválido.' });
      const { data: ct } = await adminClient.from('school_contratacoes').select('id, status, school_id, asaas_subscription_id').eq('id', contratacaoId).maybeSingle();
      if (!ct) return json(corsHeaders, 404, { error: 'Contratação não encontrada.' });
      if (ct.status !== 'aguardando_pagamento') return json(corsHeaders, 409, { error: `Só contratação aguardando pagamento pode ser cancelada (atual: ${ct.status}).` });
      const { data: abertas } = await adminClient.from('zela_cobrancas').select('asaas_payment_id')
        .eq('contratacao_id', ct.id).in('status', ['pendente', 'vencida']).not('asaas_payment_id', 'is', null);
      // Links cancelados no Asaas primeiro: um link aberto de contrato cancelado ainda aceitaria pagamento.
      const feitos: string[] = [];
      try {
        for (const a of abertas || []) { await asaas.cancelPayment(a.asaas_payment_id); feitos.push(a.asaas_payment_id); }
      } catch (e) {
        for (const id of feitos) await asaas.restorePayment(id).catch(() => {});
        throw e;
      }
      const { error: rpcErr } = await userClient.rpc('zela_contratacao_cancelar_pendente', { p_contratacao_id: ct.id });
      if (rpcErr) {
        for (const id of feitos) await asaas.restorePayment(id).catch(() => {});
        return json(corsHeaders, 422, { error: rpcErr.message });
      }
      // Assinatura por último: o Asaas não restaura assinatura cancelada, então só cancela depois que o banco aceitou.
      // Se falhar, o webhook ignora qualquer cobrança futura dela (contratação cancelada) e fica o aviso.
      if (ct.asaas_subscription_id) {
        try {
          await asaas.cancelSubscription(ct.asaas_subscription_id);
        } catch (e) {
          const erro = (e as Error)?.message || String(e);
          await logEdgeError(adminClient, 'create-zela-charge', `Cancelamento da assinatura falhou: ${erro}`, { contratacao_id: ct.id }, ct.school_id);
          return json(corsHeaders, 200, { ok: true, aviso: 'Contratação cancelada aqui, mas a assinatura no Asaas não foi cancelada. Cancele lá para não gerar novas cobranças.' });
        }
      }
      return json(corsHeaders, 200, { ok: true });
    }

    if (action === 'reajustar_mensal') {
      const contratacaoId = body?.contratacao_id;
      if (typeof contratacaoId !== 'string' || !UUID.test(contratacaoId)) return json(corsHeaders, 400, { error: 'contratacao_id inválido.' });
      const ano = Number(body?.ano_ipca);
      const percentual = Number(body?.percentual);
      if (!Number.isInteger(ano) || !Number.isFinite(percentual)) return json(corsHeaders, 400, { error: 'ano_ipca e percentual inválidos.' });
      // A RPC valida a trava (só Mensal ativo, 12 meses, teto do IPCA) e registra quem reajustou.
      const { data: rj, error: rjErr } = await userClient.rpc('zela_reajuste_mensal_registrar', {
        p_contratacao_id: contratacaoId, p_ano_ipca: ano, p_percentual: percentual,
      });
      if (rjErr) return json(corsHeaders, 422, { error: rjErr.message });
      try {
        // Só cobranças futuras: as já emitidas ficam com o valor antigo.
        await asaas.updateSubscription(rj.subscription_id, { value: Number(rj.valor_novo), updatePendingPayments: false });
      } catch (e) {
        // Asaas não aceitou: desfaz o registro para não travar o próximo reajuste por 12 meses.
        await adminClient.from('zela_reajustes_mensal').delete().eq('id', rj.reajuste_id);
        throw e;
      }
      await adminClient.from('zela_reajustes_mensal').update({ sincronizado_asaas: true }).eq('id', rj.reajuste_id);
      return json(corsHeaders, 200, { ok: true, valor_anterior: rj.valor_anterior, valor_novo: rj.valor_novo });
    }

    if (action === 'novo_vencimento' || action === 'cancelar' || action === 'marcar_paga') {
      const cobrancaId = body?.cobranca_id;
      if (typeof cobrancaId !== 'string' || !UUID.test(cobrancaId)) return json(corsHeaders, 400, { error: 'cobranca_id inválido.' });
      const { data: cb } = await adminClient.from('zela_cobrancas')
        .select('id, school_id, status, valor, vencimento, asaas_payment_id').eq('id', cobrancaId).maybeSingle();
      if (!cb) return json(corsHeaders, 404, { error: 'Cobrança não encontrada.' });
      if (!['pendente', 'vencida'].includes(cb.status)) return json(corsHeaders, 409, { error: `Cobrança ${cb.status} não aceita esta ação.` });

      if (action === 'novo_vencimento') {
        const venc = body?.vencimento;
        if (typeof venc !== 'string' || !DATA_ISO.test(venc)) return json(corsHeaders, 400, { error: 'vencimento inválido.' });
        // A RPC valida data e estado antes; chamamos o Asaas só se ela aceitar, revertendo se o Asaas falhar.
        const { error: rpcErr } = await userClient.rpc('zela_cobranca_novo_vencimento', { p_cobranca_id: cb.id, p_vencimento: venc });
        if (rpcErr) return json(corsHeaders, 422, { error: rpcErr.message });
        if (cb.asaas_payment_id) {
          try {
            await asaas.updatePayment(cb.asaas_payment_id, { dueDate: venc });
          } catch (e) {
            await adminClient.from('zela_cobrancas').update({ vencimento: cb.vencimento, status: cb.status }).eq('id', cb.id);
            throw e;
          }
        }
        return json(corsHeaders, 200, { ok: true });
      }

      if (action === 'cancelar') {
        if (cb.asaas_payment_id) await asaas.cancelPayment(cb.asaas_payment_id);
        const { error: rpcErr } = await userClient.rpc('zela_cobranca_cancelar', { p_cobranca_id: cb.id });
        if (rpcErr) {
          if (cb.asaas_payment_id) await asaas.restorePayment(cb.asaas_payment_id).catch(() => {});
          return json(corsHeaders, 422, { error: rpcErr.message });
        }
        return json(corsHeaders, 200, { ok: true });
      }

      // marcar_paga: banco primeiro (valida e ativa o contrato); Asaas em seguida para parar de cobrar.
      const comprovante = typeof body?.comprovante === 'string' ? body.comprovante : null;
      const { error: rpcErr } = await userClient.rpc('zela_cobranca_marcar_paga', { p_cobranca_id: cb.id, p_comprovante: comprovante });
      if (rpcErr) return json(corsHeaders, 422, { error: rpcErr.message });
      if (cb.asaas_payment_id) {
        try {
          await asaas.receiveInCash(cb.asaas_payment_id, { paymentDate: new Date().toISOString().slice(0, 10), value: Number(cb.valor), notifyCustomer: false });
        } catch (e) {
          const erro = (e as Error)?.message || String(e);
          await logEdgeError(adminClient, 'create-zela-charge', `Baixa manual no Asaas falhou: ${erro}`, { cobranca_id: cb.id }, cb.school_id);
          return json(corsHeaders, 200, { ok: true, aviso: 'Marcada como paga aqui, mas a baixa no Asaas falhou. Dê baixa lá para parar a cobrança.' });
        }
      }
      return json(corsHeaders, 200, { ok: true });
    }

    return json(corsHeaders, 400, { error: 'Ação inválida.' });
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    console.error('[create-zela-charge]', msg);
    try { await logEdgeError(adminClient, 'create-zela-charge', msg); } catch (_) { /* melhor esforço */ }
    return json(corsHeaders, 500, { error: msg });
  }
});
