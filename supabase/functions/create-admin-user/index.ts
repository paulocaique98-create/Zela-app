import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ehRecepcao } from "../_shared/papeis.ts";
import { logEdgeError } from "../_shared/logEdgeError.ts";
import { exigirEscolaLiberada } from '../_shared/escolaLiberada.ts';
import { verificarEmailReal } from '../_shared/emailReal.ts';

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
    // escola_liberada só tem EXECUTE para service_role (migration 20261210120000);
    // chamar com o client do usuário falha sempre. O caller já foi validado pelo JWT acima.
    await exigirEscolaLiberada(
      createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      ),
      userData,
    );

    // Hierarquia de contas (27/09/2026): a Gestão é o topo da escola e cria
    // admins, professores e responsáveis (Fase 1, em paralelo com o admin).
    // Gestão Pedagógica (Coordenação/Direção, 29/09/2026): cria professoras e
    // famílias, nunca contas da equipe.
    if (!userData || !['recepcao', 'developer', 'gestao', 'gestao_pedagogica'].includes(userData.role)) {
      throw new Error('Permissão negada');
    }

    // Rate limit: a chave usa o id do caller já validado pelo JWT acima, nunca
    // um valor vindo do corpo da requisição — não dá pra "gastar" o limite de
    // outra pessoa por aqui.
    //
    // IMPORTANTE (achado do P0.2): check_rate_limit precisa ser chamada com
    // o client service_role, nunca com o client autenticado do próprio
    // chamador — desde a revisão das funções SECURITY DEFINER, o EXECUTE
    // direto foi revogado de `authenticated` (aceitava p_key arbitrário,
    // virava vetor de DoS direcionado). Todas as outras Edge Functions do
    // projeto já chamavam via adminClient; esta era a única inconsistente.
    const supabaseAdminForRateLimit = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: rateLimitOk, error: rateLimitError } = await supabaseAdminForRateLimit.rpc('check_rate_limit', {
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

    const emailCheck = await verificarEmailReal(email);
    if (!emailCheck.ok) throw new Error(emailCheck.error);

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
    // Hierarquia de contas (decisão de 27/09/2026): a conta da Gestão é o
    // topo da escola e é criada SÓ pelo suporte (developer), na adesão da
    // escola -- nunca por admin, nem pelo admin principal.
    if (!['recepcao', 'teacher', 'family', 'gestao', 'gestao_pedagogica', 'marketing'].includes(role)) {
      throw new Error('role deve ser "teacher", "family", "gestao", "gestao_pedagogica" ou "marketing".');
    }
    if (role === 'gestao' && userData.role !== 'developer') {
      throw new Error('Só o suporte do Zela pode criar a conta da Gestão.');
    }
    // Fase 3: admin só é criado pela Gestão (ou pelo suporte); a Gestão
    // Pedagógica (Coordenação/Direção) também.
    if ((ehRecepcao(role) || role === 'gestao_pedagogica' || role === 'marketing') && userData.role !== 'gestao' && userData.role !== 'developer') {
      throw new Error('Só a Gestão da escola pode criar contas da equipe.');
    }
    const efDepartamento = (extra_fields || {}).departamento;
    if (role === 'gestao_pedagogica' && !['coordenacao', 'diretoria_pedagogica'].includes(efDepartamento)) {
      throw new Error('Escolha Coordenação ou Diretoria Pedagógica para esta conta.');
    }
    // Fase 2: professor/responsável criado pelo admin nasce pendente e só a
    // Gestão aprova (users.status; ver protect_admin_privilege_columns).
    const createdAsPending = ehRecepcao(userData.role);

    // Se for admin, só pode criar para a própria escola
    let finalSchoolId = school_id;
    if (ehRecepcao(userData.role) || userData.role === 'gestao' || userData.role === 'gestao_pedagogica') {
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
    if (ehRecepcao(role) || role === 'gestao_pedagogica') {
      safeExtraFields.departamento = ef.departamento ?? null;
      if (userData.role === 'developer' || userData.role === 'gestao') {
        safeExtraFields.chat_visibilidade_total = !!ef.chat_visibilidade_total;
      }
    }
    if (role === 'teacher') {
      safeExtraFields.turmas = Array.isArray(ef.turmas) ? ef.turmas : [];
    }
    if (role === 'gestao' || role === 'gestao_pedagogica' || role === 'marketing') {
      // Conta com acesso amplo e senha escolhida por outra pessoa: troca
      // obrigatória no primeiro acesso.
      safeExtraFields.must_change_password = true;
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
        ...safeExtraFields,
        ...(createdAsPending ? { status: 'pending' } : {}),
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
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'create-admin-user', error.message || String(error));
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
