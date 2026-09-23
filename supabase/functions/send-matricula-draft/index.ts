import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { logEdgeError } from '../_shared/logEdgeError.ts'

// Efetiva um rascunho de matricula_import_drafts (gerado por
// import-matricula-ai) depois que o admin revisou o resumo e confirmou.
// A partir daqui é exatamente a mesma lógica de import-matricula-batch:
// reaproveita conta por e-mail se já existir, senão cria uma pendente, e
// insere a solicitação com status='pending' -- passa pelo MESMO fluxo de
// aprovação de sempre em Formulários > Matrículas. O rascunho é marcado
// como 'sent' no final (não apagado, fica no histórico).
const DEFAULT_PASSWORD = '123456'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Não autorizado')

    const { data: callerData } = await supabaseClient
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single()

    if (!callerData || (callerData.role !== 'admin' && callerData.role !== 'developer')) {
      throw new Error('Permissão negada')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: rateLimitOk, error: rateLimitError } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: `edge:send-matricula-draft:${user.id}`,
      p_limit: 20,
      p_window_seconds: 300,
    })
    if (rateLimitError) throw rateLimitError
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitos envios em pouco tempo. Aguarde alguns minutos.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      })
    }

    const { draft_id } = await req.json()
    if (!draft_id) throw new Error('draft_id é obrigatório.')

    const { data: draft, error: draftError } = await supabaseAdmin
      .from('matricula_import_drafts')
      .select('*')
      .eq('id', draft_id)
      .single()
    if (draftError || !draft) throw new Error('Rascunho não encontrado.')
    if (draft.status !== 'draft') throw new Error('Este rascunho já foi enviado ou descartado.')

    const schoolId = callerData.role === 'developer' ? draft.school_id : callerData.school_id
    if (draft.school_id !== schoolId) throw new Error('Rascunho não pertence a esta escola.')

    const fam = draft.payload
    const responsavel = fam?.responsavel
    if (!responsavel?.nome?.trim() || !responsavel?.email?.trim()) {
      throw new Error('Rascunho sem nome ou e-mail do responsável — corrija antes de enviar.')
    }
    const email = String(responsavel.email).trim().toLowerCase()
    const validCriancas = Array.isArray(fam.criancas) ? fam.criancas.filter((c: { nome?: string }) => c?.nome?.trim()) : []
    if (validCriancas.length === 0) throw new Error('Nenhuma criança válida nesse rascunho.')

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('school_id', schoolId)
      .eq('email', email)
      .maybeSingle()

    let familyId: string
    if (existingUser) {
      familyId = existingUser.id
    } else {
      const { data: newAuthUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { name: responsavel.nome, role: 'family', school_id: schoolId },
      })
      if (createAuthError || !newAuthUser.user) {
        throw new Error(createAuthError?.message?.includes('already registered')
          ? 'E-mail já usado por uma conta de outra escola.'
          : (createAuthError?.message || 'Erro ao criar conta.'))
      }
      familyId = newAuthUser.user.id

      const { error: publicUserError } = await supabaseAdmin.from('users').insert({
        id: familyId,
        name: responsavel.nome,
        email,
        phone: responsavel.telefone || null,
        role: 'family',
        school_id: schoolId,
        status: 'pending',
      })
      if (publicUserError) {
        await supabaseAdmin.auth.admin.deleteUser(familyId)
        throw new Error('Erro ao salvar cadastro: ' + publicUserError.message)
      }

      const { error: authorizedError } = await supabaseAdmin.from('authorized_persons').insert([{
        family_id: familyId,
        name: responsavel.nome,
        relation: 'Responsável (Titular)',
        has_photo: false,
        emergency_order: 1,
        school_id: schoolId,
      }])
      if (authorizedError) {
        await supabaseAdmin.from('users').delete().eq('id', familyId)
        await supabaseAdmin.auth.admin.deleteUser(familyId)
        throw new Error('Erro ao salvar autorizado titular: ' + authorizedError.message)
      }
    }

    const { data: novaSolicitacao, error: insertError } = await supabaseAdmin
      .from('matricula_solicitacoes')
      .insert({
        school_id: schoolId,
        family_id: familyId,
        status: 'pending',
        tipo: 'rematricula',
        responsavel_financeiro: responsavel,
        segundo_responsavel: fam.segundo_responsavel?.nome?.trim() ? fam.segundo_responsavel : null,
        criancas: validCriancas,
        autorizados: Array.isArray(fam.autorizados) ? fam.autorizados.filter((a: { nome?: string }) => a?.nome?.trim()) : [],
        transporte_autorizados: [],
      })
      .select('id')
      .single()
    if (insertError) throw new Error('Erro ao criar solicitação: ' + insertError.message)

    await supabaseAdmin
      .from('matricula_import_drafts')
      .update({ status: 'sent', sent_at: new Date().toISOString(), sent_matricula_id: novaSolicitacao.id })
      .eq('id', draft_id)

    return new Response(JSON.stringify({ success: true, matricula_id: novaSolicitacao.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'send-matricula-draft', error.message || String(error))
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
