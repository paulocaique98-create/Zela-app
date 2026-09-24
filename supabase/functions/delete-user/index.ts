import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { logEdgeError } from '../_shared/logEdgeError.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Ambiente não configurado corretamente.')
    }

    // 1. Criar client com SERVICE_ROLE para poder deletar auth user
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // 2. O usuário que chamou a função já está validado pelo JWT no header
    // Vamos pegar o JWT para extrair quem está chamando
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Sem token de autorização')
    }
    const token = authHeader.replace('Bearer ', '')

    // Decodificar o JWT para ter certeza de quem é o caller
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token)
    if (callerError || !caller) {
      throw new Error('Token inválido ou expirado')
    }

    // Buscar no public.users se o caller é um admin
    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users')
      .select('role, school_id')
      .eq('id', caller.id)
      .single()

    if (dbCallerError || !callerData || (callerData.role !== 'admin' && callerData.role !== 'developer')) {
      throw new Error('Acesso negado: apenas administradores podem excluir usuários')
    }

    // Rate limit: exclusão de conta é uma ação sensível/irreversível — limite
    // mais apertado que os outros. A chave usa o id do caller já validado
    // pelo JWT acima, não um valor vindo do corpo da requisição.
    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:delete-user:${caller.id}`,
      p_limit: 20,
      p_window_seconds: 60,
    })
    if (rateLimitError) throw rateLimitError
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas requisições em pouco tempo. Aguarde um instante.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      })
    }

    // 3. Obter o userId a ser excluído
    const { userId } = await req.json()
    if (!userId) {
      throw new Error('userId é obrigatório')
    }

    if (userId === caller.id) {
      throw new Error('Você não pode excluir sua própria conta por aqui.')
    }

    // Verificar se o usuário a ser excluído pertence à mesma escola do admin.
    // Achado de auditoria (Fase 17): a checagem era `if (targetData && ...)`
    // — falha ABERTA: se o SELECT não encontrasse a linha (single() sem
    // match/erro), a validação inteira era pulada em silêncio e a exclusão
    // seguia sem NENHUMA checagem de posse. Corrigido pra negar por padrão
    // quando o alvo não é encontrado, em vez de simplesmente ignorar.
    if (callerData.role !== 'developer') {
      const { data: targetData, error: targetError } = await adminClient
        .from('users')
        .select('school_id, role')
        .eq('id', userId)
        .maybeSingle()

      if (targetError) throw targetError

      if (!targetData) {
        throw new Error('Acesso negado: usuário não encontrado.')
      }

      if (targetData.school_id !== callerData.school_id) {
        throw new Error('Acesso negado: o usuário não pertence a sua escola')
      }

      // Um admin não pode excluir outro admin — evita bloqueio acidental/mal-intencionado
      // da escola inteira. Só o developer (suporte) pode remover contas de admin.
      if (targetData.role === 'admin') {
        throw new Error('Acesso negado: apenas o suporte pode excluir contas de administrador.')
      }
    }

    // Achado real (login de um responsável quebrou do nada): a ordem antiga
    // apagava o Auth PRIMEIRO e só depois o public.users -- se o DELETE do
    // public.users falhasse no meio (ex: uma FK travando, como aconteceu
    // com fichas_medicas.updated_by), o Auth já tinha ido embora e a conta
    // ficava "pela metade": ninguém mais conseguia logar, mas o cadastro
    // (aluno, vínculos, fichas) continuava intacto, sem erro nenhum visível
    // pra quem excluiu. Agora a ordem é invertida: apaga tudo do banco
    // PRIMEIRO, e só apaga o login (Auth) por último, quando o resto já deu
    // certo -- se algo travar no banco, a pessoa nem percebe, o login dela
    // continua funcionando normalmente.

    // 4. Excluir os cadastros de "Autorizados" (e a foto/biometria de cada
    // um) dessa família. Achado ao investigar um falso-positivo na tela de
    // Duplicidade Facial: authorized_persons.family_id não tem ON DELETE
    // CASCADE pra users(id) (a tabela foi criada direto no dashboard, sem
    // migração no repo), então excluir só o usuário deixava a biometria
    // órfã pra trás -- ela continuava aparecendo pra sempre na varredura de
    // duplicidade, mesmo com a conta já excluída.
    const { data: orphanAuths, error: authsFetchError } = await adminClient
      .from('authorized_persons')
      .select('id, photo_storage_path')
      .eq('family_id', userId)

    if (authsFetchError) {
      console.warn(`Não foi possível buscar authorized_persons de ${userId}: ${authsFetchError.message}`)
    } else if (orphanAuths && orphanAuths.length > 0) {
      const photoPaths = orphanAuths.map(a => a.photo_storage_path).filter(Boolean)
      if (photoPaths.length > 0) {
        const { error: removePhotosError } = await adminClient.storage.from('person-photos').remove(photoPaths)
        if (removePhotosError) {
          console.warn(`Falha ao remover fotos de authorized_persons de ${userId}: ${removePhotosError.message}`)
        }
      }
      const { error: deleteAuthsError } = await adminClient
        .from('authorized_persons')
        .delete()
        .eq('family_id', userId)
      if (deleteAuthsError) {
        console.warn(`Falha ao excluir authorized_persons de ${userId}: ${deleteAuthsError.message}`)
      }
    }

    // 5. Excluir do public.users
    const { error: deletePublicError } = await adminClient
      .from('users')
      .delete()
      .eq('id', userId)

    if (deletePublicError) {
      throw new Error(`Erro ao excluir usuário público: ${deletePublicError.message}`)
    }

    // 6. Só agora, com o banco já limpo, revoga as sessões e apaga o login
    // (Auth) -- por último de propósito (ver comentário acima).
    await adminClient.auth.admin.signOut(userId, 'global')
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteAuthError) {
      const notFound = /not.?found/i.test(deleteAuthError.message || '')
      if (!notFound) {
        throw new Error(`Erro ao excluir do Auth: ${deleteAuthError.message}`)
      }
      console.warn(`Usuário já não existia no Auth: ${deleteAuthError.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Usuário excluído com sucesso dos dois ambientes.' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      }
    )

  } catch (error) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'delete-user', error.message || String(error))
    } catch (_) { /* melhor esforço */ }
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
