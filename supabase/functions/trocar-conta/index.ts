import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logEdgeError.ts";

// Contas vinculadas (29/09/2026): troca da conta aberta para outra conta do
// mesmo grupo, sem digitar senha. O banco confere o vínculo
// (conta_vinculada_ativa); só então é gerado um código de uso único, que o
// navegador troca por uma sessão da outra conta (verifyOtp). Nenhum e-mail é
// enviado. A sessão anterior é encerrada pelo navegador antes de abrir a
// nova, então "Sair" continua encerrando tudo.

function responder(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAdmin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  try {
    const callerClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return responder(corsHeaders, { error: 'Não autorizado.' }, 401);

    const { data: rateLimitOk, error: rateLimitError } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: `edge:trocar-conta:${user.id}`,
      p_limit: 20,
      p_window_seconds: 60,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) return responder(corsHeaders, { error: 'Muitas trocas em pouco tempo. Aguarde um instante.' }, 429);

    const { user_id: destino } = await req.json().catch(() => ({}));
    if (!destino) return responder(corsHeaders, { error: 'Escolha a conta.' }, 400);

    const { data: permitido, error: vinculoError } = await supabaseAdmin.rpc('conta_vinculada_ativa', { p_origem: user.id, p_destino: destino });
    if (vinculoError) throw vinculoError;
    if (!permitido) return responder(corsHeaders, { error: 'Esta conta não está vinculada à sua ou não está ativa.' }, 403);

    // E-mail de LOGIN da conta de destino (auth.users, nunca public.users).
    const { data: alvo, error: alvoError } = await supabaseAdmin.auth.admin.getUserById(destino);
    if (alvoError || !alvo?.user?.email) return responder(corsHeaders, { error: 'Conta não encontrada.' }, 400);

    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: alvo.user.email });
    if (linkError || !link?.properties?.hashed_token) throw linkError ?? new Error('Código de troca não gerado.');

    const { data: origem } = await supabaseAdmin.from('users').select('school_id').eq('id', user.id).maybeSingle();
    if (origem?.school_id) {
      await supabaseAdmin.from('audit_logs').insert({
        school_id: origem.school_id, actor_id: user.id, action: 'trocar_conta', entity_type: 'user', entity_id: destino, details: null,
      });
    }

    return responder(corsHeaders, { token_hash: link.properties.hashed_token });
  } catch (error) {
    try {
      await logEdgeError(supabaseAdmin, 'trocar-conta', (error as Error)?.message || String(error));
    } catch (_) { /* melhor esforço */ }
    return responder(corsHeaders, { error: 'Não foi possível trocar de conta agora. Tente de novo.' }, 400);
  }
});
