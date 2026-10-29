import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { criarClienteAsaas } from '../_shared/financialContract.ts';
import { calcularValorDoCiclo } from '../_shared/planPricing.ts';
import type { PeriodicidadeDeCobranca } from '../_shared/planPricing.ts';
import { bolsaVigenteEm, descontoComBolsas } from '../_shared/scholarshipDiscount.ts';
import type { BolsaVigente } from '../_shared/scholarshipDiscount.ts';

// Aplica as bolsas vigentes de UM aluno na mensalidade ativa dele (item 13). Só a Gestão.
// Recalcula no servidor: desconto da família + bolsas, com o limite da escola. Asaas primeiro,
// Zela depois; vale para as cobranças que o Asaas gerar daqui para frente (as já emitidas
// ficam como estão, use "Ajustar valor" numa delas). dry_run devolve só a prévia.
// Bolsa que leva o desconto a 100% não mexe na assinatura: avisa para marcar a família como
// bolsista ou cancelar o contrato.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  let adminClient: ReturnType<typeof createClient> | null = null;
  try {
    adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users').select('role, school_id').eq('id', caller.id).single();
    if (dbCallerError || !callerData || callerData.role !== 'gestao') {
      throw new Error('Acesso negado: apenas a Gestão pode aplicar bolsas.');
    }
    const schoolId = callerData.school_id;

    const { data: escola } = await adminClient
      .from('schools').select('features_enabled, scholarship_max_discount_percent').eq('id', schoolId).single();
    if (escola?.features_enabled?.bolsas !== true) throw new Error('O módulo de bolsas não está ligado nesta escola.');

    const corpo = await req.json();
    const studentId = String(corpo?.student_id || '');
    const dryRun = corpo?.dry_run !== false;
    if (!UUID.test(studentId)) throw new Error('Aluno inválido.');

    const { data: contrato, error: contratoError } = await adminClient
      .from('financial_contracts')
      .select('id, student_id, billing_cycle, base_monthly_amount_cents, discount_percent_applied, amount_cents, gateway_subscription_id, financial_guardian_id')
      .eq('school_id', schoolId).eq('student_id', studentId).eq('status', 'active')
      .maybeSingle();
    if (contratoError) throw contratoError;
    if (!contrato) return json({ aplicado: false, motivo: 'sem_contrato', mensagem: 'O aluno ainda não tem mensalidade ativa. A bolsa será aplicada quando ela for criada.' });
    if (!contrato.gateway_subscription_id) return json({ aplicado: false, motivo: 'sem_assinatura', mensagem: 'A mensalidade não tem assinatura no Asaas.' });

    const { data: desconto } = await adminClient
      .from('financial_billing_discounts').select('discount_percent')
      .eq('school_id', schoolId).eq('guardian_id', contrato.financial_guardian_id)
      .eq('billing_cycle', contrato.billing_cycle).maybeSingle();
    const { data: grants, error: grantsError } = await adminClient
      .from('scholarship_grants')
      .select('percentual, valor_cents, inicio, fim, encerrada_em, scholarship_types(cumulativa)')
      .eq('school_id', schoolId).eq('student_id', studentId).is('encerrada_em', null);
    if (grantsError) throw grantsError;

    const hoje = new Date().toISOString().slice(0, 10);
    const bolsas: BolsaVigente[] = (grants || [])
      // deno-lint-ignore no-explicit-any
      .filter((g: any) => bolsaVigenteEm(g, hoje))
      // deno-lint-ignore no-explicit-any
      .map((g: any) => {
        const tipo = Array.isArray(g.scholarship_types) ? g.scholarship_types[0] : g.scholarship_types;
        return { percentual: g.percentual, valor_cents: g.valor_cents, cumulativa: tipo?.cumulativa !== false };
      });
    const total = descontoComBolsas(
      contrato.base_monthly_amount_cents, Number(desconto?.discount_percent ?? 0), bolsas,
      Number(escola?.scholarship_max_discount_percent ?? 100),
    );
    if (total.total >= 100) {
      return json({ aplicado: false, motivo: 'bolsa_total', mensagem: 'A bolsa cobre 100% da mensalidade. Marque a família como bolsista (Condição financeira) e cancele o contrato atual.' });
    }
    const novoValor = calcularValorDoCiclo(contrato.base_monthly_amount_cents, contrato.billing_cycle as PeriodicidadeDeCobranca, total.total);
    const previa = {
      from_percent: Number(contrato.discount_percent_applied) || 0,
      to_percent: total.total,
      from_amount_cents: contrato.amount_cents,
      to_amount_cents: novoValor,
      limitado: total.limitado,
    };
    if (previa.from_percent === previa.to_percent && novoValor === contrato.amount_cents) {
      return json({ aplicado: false, motivo: 'sem_mudanca', mensagem: 'A mensalidade já está com esse desconto.', ...previa });
    }
    if (dryRun) return json({ dry_run: true, ...previa });

    const asaas = await criarClienteAsaas(adminClient, schoolId, createAsaasClient);
    // deno-lint-ignore no-explicit-any
    await (asaas as any).updateSubscription(contrato.gateway_subscription_id, { value: novoValor / 100, updatePendingPayments: false });
    const { error: updateError } = await adminClient
      .from('financial_contracts')
      .update({ discount_percent_applied: total.total, amount_cents: novoValor, updated_at: new Date().toISOString() })
      .eq('id', contrato.id);
    if (updateError) throw updateError;
    await adminClient.from('audit_logs').insert({
      school_id: schoolId,
      actor_id: caller.id,
      action: 'apply_scholarship_discount',
      entity_type: 'financial_contract',
      entity_id: contrato.id,
      details: previa,
    });
    return json({ dry_run: false, aplicado: true, ...previa });
  } catch (err) {
    if (adminClient) await logEdgeError(adminClient, 'apply-scholarship-discount', (err as Error).message || String(err), {}, null, 'warn');
    return json({ error: (err as Error).message }, 400);
  }
});
