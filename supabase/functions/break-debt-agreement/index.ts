import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { criarClienteAsaas } from '../_shared/financialContract.ts';
import { sendFamilyNotification } from '../_shared/sendFamilyNotification.ts';
import { DIAS_PARA_ROMPER, diasDeAtraso } from '../_shared/debtAgreement.ts';

// Item 10: encerra um acordo (só a Gestão).
//  - aguardando_assinatura: cancela o acordo e o termo; nada mudou no Asaas.
//  - ativo: rompe, mas só se uma parcela estiver com 30 dias ou mais de atraso (regra D8).
//    As cobranças originais voltam a valer pelo valor cheio, as parcelas abertas são canceladas
//    e o que a família já pagou fica registrado para a Gestão abater (ajuste de cobrança).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABERTAS = ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE'];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  // deno-lint-ignore no-explicit-any
  let adminClient: any = null;
  try {
    adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData } = await adminClient.from('users').select('role, school_id').eq('id', caller.id).single();
    if (!callerData || callerData.role !== 'gestao') throw new Error('Acesso negado: apenas a Gestão pode encerrar acordos.');
    const schoolId = callerData.school_id;

    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:break-debt-agreement:${caller.id}`, p_limit: 20, p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) return json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, 429);

    const { agreement_id, motivo } = await req.json();
    if (!agreement_id || !UUID.test(String(agreement_id))) throw new Error('Informe o acordo.');
    const justificativa = String(motivo || '').trim().slice(0, 500);
    if (justificativa.length < 3) throw new Error('Informe o motivo.');

    const { data: acordo, error: acordoError } = await adminClient
      .from('debt_agreements')
      .select('id, status, guardian_id, student_id, contract_id, ativando_em')
      .eq('id', agreement_id).eq('school_id', schoolId).maybeSingle();
    if (acordoError) throw acordoError;
    if (!acordo) throw new Error('Acordo não encontrado nesta escola.');

    const agora = new Date().toISOString();
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    if (acordo.status === 'aguardando_assinatura') {
      if (acordo.ativando_em && Date.now() - Date.parse(acordo.ativando_em) < 5 * 60000) {
        throw new Error('A ativação deste acordo está em andamento. Tente de novo em alguns minutos.');
      }
      const { error } = await adminClient.from('debt_agreements')
        .update({ status: 'cancelado', encerrado_em: agora, motivo_encerramento: justificativa })
        .eq('id', acordo.id).eq('status', 'aguardando_assinatura');
      if (error) throw error;
      await adminClient.from('debt_agreement_charges').update({ ativa: false }).eq('agreement_id', acordo.id);
      if (acordo.contract_id) {
        await adminClient.from('contract_documents').update({ status: 'cancelado' }).eq('id', acordo.contract_id).eq('school_id', schoolId);
      }
      await adminClient.from('audit_logs').insert({
        school_id: schoolId, actor_id: caller.id, action: 'cancel_debt_agreement',
        entity_type: 'debt_agreement', entity_id: acordo.id, details: { motivo: justificativa },
      });
      return json({ agreement_id: acordo.id, status: 'cancelado' });
    }

    if (acordo.status !== 'ativo') throw new Error('Este acordo já foi encerrado.');

    const { data: parcelas, error: parcelasError } = await adminClient
      .from('debt_agreement_installments')
      .select('id, numero, amount_cents, due_date, financial_charges(id, status, gateway_payment_id, due_date)')
      .eq('agreement_id', acordo.id);
    if (parcelasError) throw parcelasError;
    // deno-lint-ignore no-explicit-any
    const lista = (parcelas || []) as any[];
    const atrasadaDemais = lista.some((p) => p.financial_charges?.status === 'OVERDUE'
      && diasDeAtraso(p.financial_charges.due_date, hoje) >= DIAS_PARA_ROMPER);
    if (!atrasadaDemais) {
      throw new Error(`O acordo só pode ser rompido quando uma parcela passa de ${DIAS_PARA_ROMPER} dias de atraso.`);
    }

    const { data: vinculos, error: vinculosError } = await adminClient
      .from('debt_agreement_charges')
      .select('charge_id, status_anterior, financial_charges(id, status, gateway_payment_id)')
      .eq('agreement_id', acordo.id).eq('ativa', true);
    if (vinculosError) throw vinculosError;
    // deno-lint-ignore no-explicit-any
    const originais = ((vinculos || []) as any[]).filter((v) => v.financial_charges);

    const asaas = await criarClienteAsaas(adminClient, schoolId, createAsaasClient);
    // deno-lint-ignore no-explicit-any
    const a = asaas as any;
    const restauradas: string[] = [];
    const desfazer = async () => {
      for (const id of restauradas) { try { await a.cancelPayment(id); } catch (_) { /* melhor esforço */ } }
    };

    try {
      // 1) Originais voltam a valer.
      for (const v of originais) {
        const pid = v.financial_charges.gateway_payment_id;
        if (pid) { await a.restorePayment(pid); restauradas.push(pid); }
      }
      // 2) Parcelas ainda abertas são canceladas.
      for (const p of lista) {
        const c = p.financial_charges;
        if (c && ABERTAS.includes(c.status) && c.gateway_payment_id) await a.cancelPayment(c.gateway_payment_id);
      }
    } catch (e) {
      await desfazer();
      throw e;
    }

    const idsParcelasAbertas = lista.filter((p) => p.financial_charges && ABERTAS.includes(p.financial_charges.status)).map((p) => p.financial_charges.id);
    if (idsParcelasAbertas.length) {
      await adminClient.from('financial_charges').update({ status: 'CANCELLED', updated_at: agora }).in('id', idsParcelasAbertas).eq('school_id', schoolId);
      await adminClient.from('financial_charge_events').insert(
        idsParcelasAbertas.map((id) => ({ charge_id: id, event_type: 'CANCELLED_BY_AGREEMENT', source: 'admin_manual', metadata: { agreement_id: acordo.id, by: caller.id, motivo: 'rompimento' } })),
      );
    }
    for (const v of originais) {
      await adminClient.from('financial_charges').update({ status: v.status_anterior, updated_at: agora }).eq('id', v.charge_id).eq('school_id', schoolId);
      await adminClient.from('financial_charge_events').insert({
        charge_id: v.charge_id, event_type: 'REOPENED_BY_AGREEMENT_BREAK', source: 'admin_manual', metadata: { agreement_id: acordo.id, by: caller.id },
      });
    }

    const { error: rompeError } = await adminClient.from('debt_agreements')
      .update({ status: 'rompido', encerrado_em: agora, motivo_encerramento: justificativa })
      .eq('id', acordo.id).eq('status', 'ativo');
    if (rompeError) throw rompeError;
    await adminClient.from('debt_agreement_charges').update({ ativa: false }).eq('agreement_id', acordo.id);

    const pagoCents = lista.filter((p) => p.financial_charges?.status === 'PAID').reduce((s, p) => s + p.amount_cents, 0);
    await adminClient.from('audit_logs').insert({
      school_id: schoolId, actor_id: caller.id, action: 'break_debt_agreement',
      entity_type: 'debt_agreement', entity_id: acordo.id,
      details: { motivo: justificativa, pago_cents: pagoCents, parcelas_canceladas: idsParcelasAbertas.length },
    });

    try {
      await sendFamilyNotification(adminClient, {
        schoolId, familyId: acordo.guardian_id, studentId: acordo.student_id, type: 'financeiro',
        message: 'O acordo de dívida foi rompido por atraso. As cobranças originais voltaram a valer. Procure a escola.',
        url: '/?tab=financeiro', pushTitle: 'Acordo de dívida rompido',
        pushBody: 'As cobranças originais voltaram a valer.', pushTag: 'financeiro-acordo-rompido',
      });
    } catch (notifyErr) {
      console.error('[break-debt-agreement] Erro ao notificar família:', notifyErr);
    }

    return json({ agreement_id: acordo.id, status: 'rompido', pago_cents: pagoCents });
  } catch (err) {
    if (adminClient) await logEdgeError(adminClient, 'break-debt-agreement', (err as Error).message || String(err), {}, null, 'warn');
    return json({ error: (err as Error).message }, 400);
  }
});
