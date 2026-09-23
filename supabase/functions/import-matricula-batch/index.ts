import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { logEdgeError } from '../_shared/logEdgeError.ts'

// import-matricula-batch — importação em massa de formulários antigos
// (planilha) pra dentro do fluxo já existente de Matrícula/Rematrícula.
// Cada família da planilha vira uma solicitação em matricula_solicitacoes
// com status 'pending' -- revisada pelo admin em Formulários > Matrículas
// com o MESMO fluxo de aprovação já usado hoje (approve_matricula), nunca
// vira cadastro oficial sem revisão humana.
//
// Diferente de create-admin-user (usado no import de Excel que já existia,
// AdminImportModal.jsx), aqui NÃO criamos o aluno/vínculo direto -- só a
// CONTA do responsável (se ainda não existir), pra poder pendurar a
// solicitação nela (matricula_solicitacoes.family_id é NOT NULL). Se o
// e-mail já pertence a uma família existente da escola (comum: já é
// família ativa, só está fazendo a rematrícula pela planilha), reaproveita
// a conta que já existe em vez de criar outra.
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
      p_key: `edge:import-matricula-batch:${user.id}`,
      p_limit: 3,
      p_window_seconds: 300,
    })
    if (rateLimitError) throw rateLimitError
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas importações em pouco tempo. Aguarde alguns minutos.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      })
    }

    const { families } = await req.json()
    if (!Array.isArray(families) || families.length === 0) {
      throw new Error('Nenhuma família encontrada no arquivo.')
    }
    if (families.length > 200) {
      throw new Error('Máximo de 200 famílias por importação. Divida o arquivo em partes menores.')
    }

    const schoolId = callerData.school_id
    const results: Array<{ index: number; status: 'success' | 'error'; message: string }> = []

    for (let i = 0; i < families.length; i++) {
      const fam = families[i]
      try {
        const responsavel = fam.responsavel
        if (!responsavel?.nome?.trim() || !responsavel?.email?.trim() || !responsavel?.cpf?.trim()) {
          throw new Error('Responsável sem nome, e-mail ou CPF.')
        }
        const email = String(responsavel.email).trim().toLowerCase()
        const validCriancas = Array.isArray(fam.criancas) ? fam.criancas.filter((c: { nome?: string }) => c?.nome?.trim()) : []
        if (validCriancas.length === 0) throw new Error('Nenhuma criança válida nessa família.')

        // 1. Reaproveita a conta se já existir família com esse e-mail
        // nesta escola; senão cria uma nova, pendente (mesmo padrão do
        // link público de matrícula).
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

        // 2. A solicitação em si -- fica pendente até o admin revisar em
        // Formulários > Matrículas, igual a qualquer outra.
        const { error: insertError } = await supabaseAdmin.from('matricula_solicitacoes').insert({
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
        if (insertError) throw new Error('Erro ao criar solicitação: ' + insertError.message)

        results.push({ index: i, status: 'success', message: `${responsavel.nome} — ${validCriancas.length} criança(s) importada(s).` })
      } catch (rowError) {
        results.push({ index: i, status: 'error', message: rowError.message || String(rowError) })
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'import-matricula-batch', error.message || String(error))
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
