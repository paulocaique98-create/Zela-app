import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { criarClienteAsaas } from '../_shared/financialContract.ts';
import { configurarNotaDoContrato } from '../_shared/nfseContrato.ts';

// NFS-e: liga a nota automática em contratos que já existiam (ou cuja configuração falhou).
// Só a Gestão. Recebe { contract_id } para um contrato ou {} para todos os ativos ainda sem nota
// configurada (até 200 por chamada). Cada contrato é conferido contra a escola de quem chama.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let adminClient: ReturnType<typeof createClient> | null = null;
  try {
    adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData } = await adminClient.from('users').select('role, school_id').eq('id', caller.id).single();
    if (!callerData || callerData.role !== 'gestao') throw new Error('Acesso negado: apenas a Gestão pode ligar a nota fiscal.');
    const schoolId = callerData.school_id;

    const { data: rateOk, error: rateError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:enable-contract-nfse:${caller.id}`, p_limit: 10, p_window_seconds: 300,
    });
    if (rateError) throw rateError;
    if (!rateOk) return json({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' }, 429);

    const { contract_id } = await req.json().catch(() => ({}));
    let consulta = adminClient
      .from('financial_contracts')
      .select('id, gateway_subscription_id')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .not('gateway_subscription_id', 'is', null);
    if (contract_id) consulta = consulta.eq('id', String(contract_id));
    else consulta = consulta.is('nfse_configurada_em', null).limit(200);
    const { data: contratos, error: listError } = await consulta;
    if (listError) throw listError;

    const asaas = await criarClienteAsaas(adminClient, schoolId, createAsaasClient) as ReturnType<typeof createAsaasClient>;
    let configurados = 0;
    const falhas: { contract_id: string; motivo: string }[] = [];
    for (const c of contratos || []) {
      const r = await configurarNotaDoContrato(adminClient, asaas, schoolId, c.id, c.gateway_subscription_id);
      if (r.configurada) configurados++;
      else falhas.push({ contract_id: c.id, motivo: r.motivo || 'Falha ao configurar.' });
    }
    return json({ total: (contratos || []).length, configurados, falhas: falhas.slice(0, 20) });
  } catch (err) {
    if (adminClient) await logEdgeError(adminClient, 'enable-contract-nfse', (err as Error).message || String(err), {});
    return json({ error: (err as Error).message }, 400);
  }
});
