import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { criarClienteAsaas } from '../_shared/financialContract.ts';

// NFS-e: busca, na conta Asaas da própria escola, os serviços do município dela (ex.: "ensino").
// Só a Gestão com o módulo `nfse` ligado. Devolve id, descrição e ISS de referência da prefeitura.
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
    if (!callerData || callerData.role !== 'gestao') throw new Error('Acesso negado: apenas a Gestão pode consultar os serviços.');
    const schoolId = callerData.school_id;

    const { data: escola } = await adminClient.from('schools').select('features_enabled').eq('id', schoolId).maybeSingle();
    if (escola?.features_enabled?.nfse !== true) throw new Error('O módulo de nota fiscal está desligado para esta escola.');

    const { data: rateOk, error: rateError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:list-municipal-services:${caller.id}`, p_limit: 30, p_window_seconds: 300,
    });
    if (rateError) throw rateError;
    if (!rateOk) return json({ error: 'Muitas buscas em pouco tempo. Aguarde alguns minutos.' }, 429);

    const { busca } = await req.json().catch(() => ({}));
    const termo = String(busca ?? '').trim().slice(0, 60);
    if (termo.length < 3) throw new Error('Digite ao menos 3 letras para buscar o serviço.');

    const asaas = await criarClienteAsaas(adminClient, schoolId, createAsaasClient) as ReturnType<typeof createAsaasClient>;
    const r = await asaas.listMunicipalServices(termo);
    const servicos = (r.data || []).slice(0, 20).map((s: { id: unknown; description: unknown; issTax: unknown }) => ({
      id: String(s.id), description: String(s.description ?? ''), issTax: typeof s.issTax === 'number' ? s.issTax : null,
    }));
    return json({ servicos });
  } catch (err) {
    if (adminClient) await logEdgeError(adminClient, 'list-municipal-services', (err as Error).message || String(err), {});
    return json({ error: (err as Error).message }, 400);
  }
});
