import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logEdgeError.ts";

// Recuperação do 2FA (Authenticator): quem perdeu o celular fica sem o código e
// não consegue entrar. Só o developer (suporte da Zela) remove os fatores de TOTP
// de outra conta; a pessoa entra de novo só com a senha e cadastra um novo
// Authenticator (obrigatório para os perfis que exigem 2FA). Fica em audit_logs.

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

    const { data: caller } = await supabaseAdmin.from('users').select('role').eq('id', user.id).maybeSingle();
    if (caller?.role !== 'developer') return responder(corsHeaders, { error: 'Apenas o suporte da Zela pode fazer isso.' }, 403);

    const { data: rateLimitOk, error: rateLimitError } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: `edge:remover-mfa:${user.id}`,
      p_limit: 10,
      p_window_seconds: 60,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) return responder(corsHeaders, { error: 'Muitas tentativas. Aguarde um instante.' }, 429);

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) return responder(corsHeaders, { error: 'Informe o e-mail da conta.' }, 400);

    // ilike para ignorar maiúsculas; \, % e _ escapados para o e-mail não virar curinga.
    const emailExato = email.replace(/[\\%_]/g, (c: string) => `\\${c}`);
    const { data: alvo } = await supabaseAdmin.from('users').select('id, school_id').ilike('email', emailExato).limit(2);
    if (!alvo || alvo.length === 0) return responder(corsHeaders, { error: 'Conta não encontrada.' }, 404);
    if (alvo.length > 1) return responder(corsHeaders, { error: 'Mais de uma conta com esse e-mail. Remova pelo painel do Supabase.' }, 409);
    const alvoId = alvo[0].id;

    const { data: lista, error: listError } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: alvoId });
    if (listError) throw listError;
    const fatores = lista?.factors ?? [];
    for (const f of fatores) {
      const { error: delError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId: alvoId });
      if (delError) throw delError;
    }

    if (alvo[0].school_id) {
      await supabaseAdmin.from('audit_logs').insert({
        school_id: alvo[0].school_id, actor_id: user.id, action: 'remover_mfa', entity_type: 'user', entity_id: alvoId,
        details: { fatores_removidos: fatores.length },
      });
    }

    return responder(corsHeaders, { ok: true, removidos: fatores.length });
  } catch (error) {
    try {
      await logEdgeError(supabaseAdmin, 'remover-mfa', (error as Error)?.message || String(error));
    } catch (_) { /* melhor esforço */ }
    return responder(corsHeaders, { error: 'Não foi possível remover o 2FA agora. Tente de novo.' }, 400);
  }
});
