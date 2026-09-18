import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { notifyAdmins } from '../_shared/notifyAdmins.ts'
import { logEdgeError } from '../_shared/logEdgeError.ts'

// public-matricula-request — endpoint PÚBLICO (sem JWT de chamador), usado
// pelo link de Matrícula que só o Admin acessa/distribui (PublicMatricula.jsx,
// rota /matricula-publica). Diferente do autocadastro simples (/cadastro,
// self-register-family, que já cria os alunos direto), aqui a família ainda
// não tem NENHUM vínculo com a escola -- então em vez de criar os alunos na
// hora, isso vira uma solicitação em matricula_solicitacoes (tipo=
// 'matricula'), revisada pelo admin em Formulários > Matrículas com o MESMO
// fluxo de aprovação que a Rematrícula já usa (approve_matricula RPC, que
// agora também ativa a conta do responsável — ver migration
// 20260930e_approve_matricula_activates_user.sql).
//
// A conta do responsável nasce aqui (status='pending', igual ao /cadastro)
// só pra ter um family_id válido pra pendurar a solicitação -- ela só vira
// utilizável de verdade quando a escola aprovar a matrícula.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Ambiente não configurado corretamente.')
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:public-matricula-request:${ip}`,
      p_limit: 5,
      p_window_seconds: 600,
    })
    if (rateLimitError) throw rateLimitError
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      })
    }

    const {
      school_code,
      email,
      password,
      responsavel,
      segundo_responsavel,
      criancas,
      autorizados,
      transporte_autorizados,
    } = await req.json()

    if (!school_code || !email || !password || !responsavel?.nome?.trim() || !responsavel?.telefone?.trim()) {
      throw new Error('Preencha ao menos o e-mail, a senha e os dados do responsável.')
    }
    if (password.length < 6) {
      throw new Error('A senha deve ter ao menos 6 caracteres.')
    }
    const validCriancas = Array.isArray(criancas) ? criancas.filter((c: { nome?: string }) => c?.nome?.trim()) : []
    if (validCriancas.length === 0) {
      throw new Error('Adicione ao menos uma criança.')
    }
    for (const c of validCriancas) {
      if (!c.nascimento || !c.ciclo || !c.periodo) {
        throw new Error(`Complete os dados de ${c.nome} (data de nascimento, ciclo e período).`)
      }
    }

    // Resolve a escola pelo código público — mesma mensagem genérica de
    // self-register-family, nunca confirma se um código "quase certo" existe.
    const { data: school, error: schoolError } = await adminClient
      .from('schools')
      .select('id')
      .eq('school_code', school_code.trim().toUpperCase())
      .maybeSingle()
    if (schoolError || !school) {
      throw new Error('Código de escola inválido. Confirme com a secretaria da escola.')
    }
    const schoolId = school.id

    // 1. Cria o usuário no Auth — email_confirm true pra já poder logar assim
    // que a matrícula for aprovada, sem precisar confirmar e-mail depois.
    const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: responsavel.nome, role: 'family', school_id: schoolId },
    })
    if (authError || !newAuthUser.user) {
      const msg = authError?.message || ''
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        throw new Error('Este e-mail já está em uso.')
      }
      throw new Error(`Erro ao criar conta: ${msg || 'Erro desconhecido'}`)
    }
    const newUserId = newAuthUser.user.id

    // 2. public.users — status 'pending' até a escola aprovar a matrícula.
    const { error: publicUserError } = await adminClient
      .from('users')
      .insert({
        id: newUserId,
        name: responsavel.nome,
        email,
        phone: responsavel.telefone || null,
        role: 'family',
        school_id: schoolId,
        status: 'pending',
      })
    if (publicUserError) {
      await adminClient.auth.admin.deleteUser(newUserId)
      if (publicUserError.code === '23505') throw new Error('Este e-mail já está em uso.')
      throw new Error(`Erro ao salvar cadastro: ${publicUserError.message}`)
    }

    // 3. Titular como autorizado (biometria cadastrada depois, no Totem) —
    // mesmo padrão do self-register-family/AdminUserRegistration.
    const { error: authorizedError } = await adminClient.from('authorized_persons').insert([{
      family_id: newUserId,
      name: responsavel.nome,
      relation: 'Responsável (Titular)',
      has_photo: false,
      emergency_order: 1,
      school_id: schoolId,
    }])
    if (authorizedError) {
      await adminClient.from('users').delete().eq('id', newUserId)
      await adminClient.auth.admin.deleteUser(newUserId)
      throw new Error(`Erro ao salvar cadastro: ${authorizedError.message}`)
    }

    // 4. A solicitação em si — fica pending até o admin decidir em
    // Formulários > Matrículas, igual à Rematrícula.
    const { error: insertError } = await adminClient.from('matricula_solicitacoes').insert({
      school_id: schoolId,
      family_id: newUserId,
      status: 'pending',
      tipo: 'matricula',
      responsavel_financeiro: responsavel,
      segundo_responsavel: segundo_responsavel?.nome?.trim() ? segundo_responsavel : null,
      criancas: validCriancas,
      autorizados: Array.isArray(autorizados) ? autorizados.filter((a: { nome?: string }) => a?.nome?.trim()) : [],
      transporte_autorizados: Array.isArray(transporte_autorizados) ? transporte_autorizados.filter((t: { nome?: string }) => t?.nome?.trim()) : [],
    })
    if (insertError) {
      await adminClient.from('authorized_persons').delete().eq('family_id', newUserId)
      await adminClient.from('users').delete().eq('id', newUserId)
      await adminClient.auth.admin.deleteUser(newUserId)
      throw new Error(`Erro ao enviar solicitação: ${insertError.message}`)
    }

    // 5. Avisa os admins — best-effort, nunca derruba a solicitação já salva.
    try {
      await notifyAdmins(adminClient, {
        schoolId,
        type: 'matricula_publica_pendente',
        message: `${responsavel.nome} enviou uma solicitação de matrícula e aguarda aprovação.`,
        url: '/?tab=matriculas',
        pushTitle: 'Nova solicitação de matrícula',
        pushBody: `${responsavel.nome} está aguardando aprovação da matrícula.`,
        pushTag: 'matricula-publica-pendente',
      })
    } catch (notifyErr) {
      console.error('[public-matricula-request] Erro ao notificar admins:', notifyErr)
    }

    return new Response(JSON.stringify({ success: true, pending: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'public-matricula-request', error.message || String(error))
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
