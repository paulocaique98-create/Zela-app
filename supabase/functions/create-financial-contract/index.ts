import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { criarClienteAsaas, criarMensalidade, MensalidadeError } from '../_shared/financialContract.ts';

// Fase 9 — Recorrência Automática, parte 1: Matrícula/contrato → plano
// financeiro → assinatura real no Asaas. Recorrência é nativa do Asaas
// (decisão da Fase 3) — esta function só cria a assinatura; o Asaas é quem
// gera cada cobrança individual no calendário certo, disparando o webhook que
// a Fase 8 já captura e que process-payment-webhook sincroniza pra
// financial_charges.
//
// A regra de criação (preço da tabela de Planos ou valor digitado, desconto
// da família, bolsista, reserva antes de chamar o Asaas) mora em
// _shared/financialContract.ts e é a mesma do lote.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let adminClient: ReturnType<typeof createClient> | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users')
      .select('role, school_id')
      .eq('id', caller.id)
      .single();
    // Financeiro é exclusivo da Gestão desde a Fase 5 da migração Admin ->
    // Gestão (a RLS já era só gestao; esta checagem tinha ficado pra trás).
    if (dbCallerError || !callerData || callerData.role !== 'gestao') {
      throw new Error('Acesso negado: apenas a Gestão pode criar contratos financeiros.');
    }
    const schoolId = callerData.school_id;

    // Rate limit (Fase 4, risco 6.11; implementado na Fase 15): cada chamada
    // cria um customer + subscription REAIS no Asaas — sem limite, uma conta
    // comprometida ou um bug de loop no client poderia gerar dezenas de
    // assinaturas reais rapidamente.
    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:create-financial-contract:${caller.id}`,
      p_limit: 20,
      p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitos contratos criados em pouco tempo. Aguarde alguns minutos.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { student_id, billing_cycle, base_monthly_amount_cents, first_due_date, billing_type, description, school_year } = await req.json();
    if (!student_id || !billing_cycle || !first_due_date) {
      throw new Error('Campos obrigatórios: student_id, billing_cycle, first_due_date');
    }

    const asaas = await criarClienteAsaas(adminClient, schoolId, createAsaasClient);
    const resultado = await criarMensalidade(adminClient, { schoolId, callerId: caller.id, asaas }, {
      student_id, billing_cycle, first_due_date, billing_type, description,
      base_monthly_amount_cents: base_monthly_amount_cents ?? null,
      school_year: school_year ?? null,
    });

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (adminClient && !(err instanceof MensalidadeError && err.code !== 'gateway')) {
      await logEdgeError(adminClient, 'create-financial-contract', err.message || String(err), {});
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
