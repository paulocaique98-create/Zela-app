import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';

// Admin da escola cadastra a PRÓPRIA chave do gateway (Opção A — 1 conta
// Asaas por escola). Valida a chave com uma chamada real ao Asaas ANTES de
// gravar (pega erro de digitação/chave errada na hora, não só quando a
// escola tentar criar a primeira cobrança). A chave nunca é devolvida pro
// client depois de gravada — só existe no Vault, lida exclusivamente por
// get_school_gateway_secret() (SECURITY DEFINER, só service_role).
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

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
    if (dbCallerError || !callerData || callerData.role !== 'admin') {
      throw new Error('Acesso negado: apenas administradores podem configurar o gateway de pagamento.');
    }

    const { gateway, api_key } = await req.json();
    if (!gateway || !api_key) {
      throw new Error('Campos obrigatórios: gateway, api_key');
    }
    if (!['asaas', 'asaas_webhook'].includes(gateway)) {
      throw new Error('Gateway não suportado. Suportado atualmente: asaas, asaas_webhook.');
    }

    // Só valida contra o Asaas quando for a chave de API de verdade — o
    // segredo de webhook (asaas_webhook) é um valor arbitrário que A
    // ESCOLA define ao criar o webhook no painel dela (authToken), não uma
    // chave de API existente; não tem como "validar" isso com uma chamada.
    if (gateway === 'asaas') {
      const asaas = createAsaasClient(api_key);
      try {
        await asaas.ping();
      } catch (pingErr) {
        throw new Error(`Não foi possível validar essa chave no Asaas: ${pingErr.message}`);
      }
    }

    const { error: rpcError } = await adminClient.rpc('set_school_gateway_secret', {
      p_school_id: callerData.school_id,
      p_gateway: gateway,
      p_secret: api_key,
    });
    if (rpcError) throw rpcError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
