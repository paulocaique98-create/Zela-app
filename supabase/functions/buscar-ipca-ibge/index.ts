import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { URL_IPCA_IBGE, lerIpcaIbge } from '../_shared/ipcaIbge.ts';

// Faturamento do Zela: busca o IPCA acumulado em 12 meses do último mês publicado pelo IBGE.
// Só LÊ e devolve { periodo, ano, mes, percentual }. Não grava nada: o developer confere o número na tela e
// registra pela RPC zela_ipca_registrar (que também trava o ano já usado em reajuste ou renovação).
// Só developer (role lido do banco a partir do JWT). URL fixa, sem parâmetros do cliente.

const json = (corsHeaders: Record<string, string>, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(corsHeaders, 405, { error: 'Método não permitido.' });

  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(corsHeaders, 401, { error: 'Sem token de autorização.' });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) return json(corsHeaders, 401, { error: 'Token inválido ou expirado.' });

    const { data: callerRow } = await adminClient.from('users').select('role').eq('id', caller.id).single();
    if (callerRow?.role !== 'developer') {
      return json(corsHeaders, 403, { error: 'Apenas o suporte (developer) pode buscar o IPCA.' });
    }

    const { data: rateOk, error: rateErr } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:buscar-ipca-ibge:${caller.id}`, p_limit: 20, p_window_seconds: 300,
    });
    if (rateErr) throw rateErr;
    if (!rateOk) return json(corsHeaders, 429, { error: 'Muitas consultas em pouco tempo. Aguarde alguns minutos.' });

    let resposta: Response;
    try {
      resposta = await fetch(URL_IPCA_IBGE, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    } catch {
      return json(corsHeaders, 502, { error: 'Não foi possível falar com o IBGE agora. Digite o valor à mão ou tente de novo.' });
    }
    if (!resposta.ok) return json(corsHeaders, 502, { error: `O IBGE respondeu com erro (${resposta.status}). Digite o valor à mão ou tente de novo.` });

    let corpo: unknown;
    try { corpo = await resposta.json(); } catch {
      return json(corsHeaders, 502, { error: 'O IBGE devolveu uma resposta ilegível. Digite o valor à mão.' });
    }

    try {
      return json(corsHeaders, 200, { ...lerIpcaIbge(corpo), fonte: 'IBGE, agregado 1737, variável 2265 (IPCA acumulado em 12 meses)' });
    } catch (e) {
      return json(corsHeaders, 502, { error: (e as Error).message });
    }
  } catch (error) {
    await logEdgeError(adminClient, 'buscar-ipca-ibge', error instanceof Error ? error.message : String(error)).catch(() => {});
    return json(corsHeaders, 500, { error: 'Não foi possível buscar o IPCA.' });
  }
});
