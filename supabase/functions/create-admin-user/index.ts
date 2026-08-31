import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

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

    // Get the session or user object
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Não autorizado');
    }

    // Verify if requester is admin or developer
    const { data: userData } = await supabaseClient
      .from('users')
      .select('role, school_id, is_primary_admin')
      .eq('id', user.id)
      .single();

    if (!userData || (userData.role !== 'admin' && userData.role !== 'developer')) {
      throw new Error('Permissão negada');
    }

    // Rate limit: a chave usa o id do caller já validado pelo JWT acima, nunca
    // um valor vindo do corpo da requisição — não dá pra "gastar" o limite de
    // outra pessoa por aqui.
    const { data: rateLimitOk, error: rateLimitError } = await supabaseClient.rpc('check_rate_limit', {
      p_key: `edge:create-admin-user:${user.id}`,
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

    const { email, password, name, role, school_id, extra_fields } = await req.json();

    // Achado de auditoria (Fase 17): `role` vinha direto do body sem
    // validação nenhuma — qualquer admin conseguia se autopromover a
    // 'developer' (super-admin cross-escola) só chamando esta function com
    // um payload diferente do que a tela manda. Esta function NUNCA cria
    // 'developer' — nenhuma tela legítima do projeto faz isso por aqui; se um
    // developer precisar ser criado, é feito por outro caminho, fora deste
    // endpoint.
    //
    // CORREÇÃO (regressão real, achada em produção no mesmo dia): a
    // primeira versão desta trava só aceitava 'admin'/'teacher' — mas
    // AdminUserRegistration.jsx usa ESTA MESMA function pra cadastrar
    // responsável (família) também, mandando role:'family' (linha ~620 do
    // componente). A trava original quebrou o cadastro de qualquer
    // responsável novo. 'family' é role legítimo aqui.
    if (role !== 'admin' && role !== 'teacher' && role !== 'family') {
      throw new Error('role deve ser "admin", "teacher" ou "family".');
    }

    // Se for admin, só pode criar para a própria escola
    let finalSchoolId = school_id;
    if (userData.role === 'admin') {
      finalSchoolId = userData.school_id;
    }

    // Allowlist explícita — nunca espalhar extra_fields direto no insert()
    // (achado de auditoria: um `...extra_fields` aceitava QUALQUER coluna de
    // `users`, incluindo is_primary_admin/chat_visibilidade_total). Mesma
    // regra de quem pode conceder chat_visibilidade_total já aplicada pela
    // trigger protect_admin_privilege_columns em UPDATE — replicada aqui à
    // mão porque esta function usa service_role (INSERT nunca passa pela
    // trigger, que só cobre UPDATE).
    const ef = extra_fields || {};
    const safeExtraFields: Record<string, unknown> = {
      phone: ef.phone ?? null,
      phone2: ef.phone2 ?? null,
      doc_type: ef.doc_type ?? null,
      doc_number: ef.doc_number ?? null,
      profession: ef.profession ?? null,
      civil_status: ef.civil_status ?? null,
      guardian_type: ef.guardian_type ?? null,
    };
    if (role === 'admin') {
      safeExtraFields.departamento = ef.departamento ?? null;
      if (userData.role === 'developer' || userData.is_primary_admin) {
        safeExtraFields.chat_visibilidade_total = !!ef.chat_visibilidade_total;
      }
    }
    if (role === 'teacher') {
      safeExtraFields.turmas = Array.isArray(ef.turmas) ? ef.turmas : [];
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: newAuthUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        name,
        role,
        school_id: finalSchoolId
      }
    });

    if (createUserError) throw createUserError;

    // Inserir no public.users
    const { data: newUser, error: dbError } = await supabaseAdmin
      .from('users')
      .insert({
        id: newAuthUser.user.id,
        name,
        email,
        role,
        school_id: finalSchoolId,
        ...safeExtraFields
      })
      .select()
      .single();

    if (dbError) {
      // Rollback se falhar no public.users
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id);
      throw dbError;
    }

    return new Response(JSON.stringify(newUser), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
