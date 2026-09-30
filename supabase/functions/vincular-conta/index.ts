import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logEdgeError.ts";

// Contas vinculadas (29/09/2026): a pessoa logada numa conta vincula outra
// conta que também é dela (ex.: Coordenadora que também é mãe de aluno).
// Prova de posse: digita o e-mail e a senha da outra conta UMA vez. A partir
// daí, troca entre elas pelo botão do cabeçalho (função trocar-conta).
// Tabela e regras: migração 20260929233347_contas_vinculadas.sql.

function responder(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseAdmin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  try {
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) return responder(corsHeaders, { error: 'Não autorizado.' }, 401);

    // Tentativas de senha contam no limite (evita adivinhar a senha de
    // outra conta por aqui).
    const { data: rateLimitOk, error: rateLimitError } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: `edge:vincular-conta:${user.id}`,
      p_limit: 5,
      p_window_seconds: 600,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) return responder(corsHeaders, { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, 429);

    const { email, password } = await req.json().catch(() => ({}));
    const emailNormalizado = String(email ?? '').trim().toLowerCase();
    if (!emailNormalizado || !password) return responder(corsHeaders, { error: 'Informe o e-mail e a senha da outra conta.' }, 400);
    if (emailNormalizado === (user.email ?? '').toLowerCase()) {
      return responder(corsHeaders, { error: 'Este é o e-mail da conta que já está aberta.' }, 400);
    }

    // Confere a senha num client separado, sem guardar sessão, e encerra SÓ
    // a sessão criada aqui (scope local). O padrão (global) derrubaria a
    // outra conta em todos os aparelhos em que ela estiver aberta.
    const conferencia = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: login, error: loginError } = await conferencia.auth.signInWithPassword({ email: emailNormalizado, password: String(password) });
    if (loginError || !login?.user) return responder(corsHeaders, { error: 'E-mail ou senha incorretos.' }, 400);
    await conferencia.auth.signOut({ scope: 'local' }).catch(() => {});

    const { error: vinculoError } = await supabaseAdmin.rpc('vincular_contas', { p_a: user.id, p_b: login.user.id });
    if (vinculoError) return responder(corsHeaders, { error: vinculoError.message }, 400);

    const { data: conta } = await supabaseAdmin.from('users').select('id, name, role, school_id').eq('id', login.user.id).maybeSingle();
    const { data: origem } = await supabaseAdmin.from('users').select('school_id').eq('id', user.id).maybeSingle();
    const escola = origem?.school_id ?? conta?.school_id;
    if (escola) {
      await supabaseAdmin.from('audit_logs').insert({
        school_id: escola, actor_id: user.id, action: 'vincular_conta', entity_type: 'user', entity_id: login.user.id,
        details: { conta_vinculada: conta?.name ?? null, perfil: conta?.role ?? null },
      });
    }

    return responder(corsHeaders, { ok: true, conta: conta ? { id: conta.id, name: conta.name, role: conta.role } : null });
  } catch (error) {
    try {
      await logEdgeError(supabaseAdmin, 'vincular-conta', (error as Error)?.message || String(error));
    } catch (_) { /* melhor esforço */ }
    return responder(corsHeaders, { error: 'Não foi possível vincular agora. Tente de novo.' }, 400);
  }
});
