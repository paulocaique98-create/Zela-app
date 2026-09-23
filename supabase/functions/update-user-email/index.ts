import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logEdgeError.ts";

// Correção definitiva do bug real (achado 23/09, caso Maria Elisa de Freitas
// Falcão): editar o e-mail de um usuário em AdminUserRegistration.jsx só
// atualizava public.users -- o login de verdade (auth.users) nunca era
// tocado, porque isso exige a Admin API (service_role), inacessível do
// client. Resultado: o cadastro mostrava o e-mail corrigido, mas
// "Esqueci minha senha" continuava batendo no e-mail antigo (com erro de
// digitação) -- e como o Supabase nunca avisa "esse e-mail não existe" (
// proteção contra enumeração), o e-mail simplesmente nunca saía, sem
// nenhum erro visível em lugar nenhum.
//
// Esta function é o ÚNICO caminho a partir de agora pra mudar o e-mail de
// qualquer usuário (admin/teacher/family) -- atualiza auth.users E
// public.users juntos, nessa ordem (auth primeiro: se falhar, nada muda;
// se o passo do banco falhar depois, desfaz o e-mail no auth pra nunca
// ficar dessincronizado de novo).
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Não autorizado');
    }

    const { data: callerData } = await supabaseClient
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!callerData || (callerData.role !== 'admin' && callerData.role !== 'developer')) {
      throw new Error('Permissão negada');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Rate limit via client service_role -- mesmo motivo documentado em
    // create-admin-user (check_rate_limit não é mais chamável direto por
    // "authenticated" desde a revisão P0.2).
    const { data: rateLimitOk, error: rateLimitError } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: `edge:update-user-email:${user.id}`,
      p_limit: 15,
      p_window_seconds: 60,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas requisições em pouco tempo. Aguarde um instante.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      });
    }

    const { user_id, new_email } = await req.json();
    if (!user_id || !new_email) {
      throw new Error('Campos obrigatórios: user_id, new_email.');
    }
    const normalizedEmail = String(new_email).trim().toLowerCase();

    // Escopo: admin só edita usuário da própria escola (developer edita
    // qualquer um) -- reconfere no banco, nunca confia em nada vindo do
    // body além do id.
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from('users')
      .select('id, email, school_id')
      .eq('id', user_id)
      .single();

    if (targetError || !targetUser) {
      throw new Error('Usuário não encontrado.');
    }
    if (callerData.role === 'admin' && targetUser.school_id !== callerData.school_id) {
      throw new Error('Permissão negada.');
    }

    // Propositalmente SEM atalho de "já está igual, não faz nada" aqui --
    // essa checagem só compara contra public.users, que é justamente o lado
    // que pode estar "certo" enquanto auth.users (o login de verdade) ainda
    // está desatualizado. Sempre chama a Admin API de verdade; ela mesma é
    // idempotente (não dá erro se o e-mail já for o mesmo lá dentro).

    // 1) Login de verdade primeiro. email_confirm:true porque quem está
    // corrigindo é o admin (ex: erro de digitação no cadastro), não o
    // próprio usuário pedindo pra trocar -- não faz sentido exigir um
    // e-mail de confirmação pro endereço que acabou de ser corrigido.
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      email: normalizedEmail,
      email_confirm: true,
    });
    if (authUpdateError) {
      if (authUpdateError.message?.toLowerCase().includes('already been registered')) {
        throw new Error('Este e-mail já está em uso por outra conta.');
      }
      throw authUpdateError;
    }

    // 2) Cadastro (public.users) -- se falhar aqui, desfaz o passo 1 pra
    // nunca deixar os dois lados dessincronizados de novo (o próprio bug
    // que esta function existe pra corrigir).
    const { error: dbUpdateError } = await supabaseAdmin
      .from('users')
      .update({ email: normalizedEmail })
      .eq('id', user_id);

    if (dbUpdateError) {
      await supabaseAdmin.auth.admin.updateUserById(user_id, { email: targetUser.email });
      if (dbUpdateError.code === '23505') throw new Error('Este e-mail já está em uso por outro usuário.');
      throw dbUpdateError;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'update-user-email', error.message || String(error));
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
