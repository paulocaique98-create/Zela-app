import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

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

    // 3. Obter o userId a ser excluído
    const { userId } = await req.json()
    if (!userId) {
      throw new Error('userId é obrigatório')
    }

    if (userId === caller.id) {
      throw new Error('Você não pode excluir sua própria conta por aqui.')
    }

    // (Opcional, mas recomendado): Verificar se o usuário a ser excluído pertence à mesma escola do admin
    if (callerData.role !== 'developer') {
      const { data: targetData } = await adminClient
        .from('users')
        .select('school_id, role')
        .eq('id', userId)
        .single()

      if (targetData && targetData.school_id !== callerData.school_id) {
        throw new Error('Acesso negado: o usuário não pertence a sua escola')
      }

      // Um admin não pode excluir outro admin — evita bloqueio acidental/mal-intencionado
      // da escola inteira. Só o developer (suporte) pode remover contas de admin.
      if (targetData && targetData.role === 'admin') {
        throw new Error('Acesso negado: apenas o suporte pode excluir contas de administrador.')
      }
    }

    // 3.5 Revogar todos os tokens ativos (Passo 3)
    // O Supabase JS client aceita admin.signOut para revogar todas as sessões do usuário.
    // Fazemos isso ANTES de apagar o usuário para evitar erros.
    await adminClient.auth.admin.signOut(userId, 'global')

    // 4. Excluir do auth.users usando a admin API
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      // Só seguimos para apagar o public.users se o motivo for "já não existe no Auth"
      // (ex: conta fantasma). Qualquer outro erro (permissão, rede, etc.) precisa parar
      // aqui — senão apagamos o perfil público e deixamos um usuário órfão no Auth.
      const notFound = /not.?found/i.test(deleteAuthError.message || '')
      if (!notFound) {
        throw new Error(`Erro ao excluir do Auth: ${deleteAuthError.message}`)
      }
      console.warn(`Usuário já não existia no Auth, prosseguindo para apagar do public: ${deleteAuthError.message}`)
    }

    // 5. Excluir do public.users
    const { error: deletePublicError } = await adminClient
      .from('users')
      .delete()
      .eq('id', userId)

    if (deletePublicError) {
      throw new Error(`Erro ao excluir usuário público: ${deletePublicError.message}`)
    }
    
    // Passo 3 do User: se não deletar (ou mesmo deletando), invalidar sessão
    // Porem o `deleteUser` já apaga o usuário e revoga tokens do Supabase automaticamente.
    // Mas conforme o requisito, chamamos signOut('others') se necessário. 
    // Contudo signOut() não aceita 'others' no user_id, ele apenas apaga a sessão se o usuário estiver lá.
    // O deleteUser já é suficiente para revogar o token no backend.

    return new Response(
      JSON.stringify({ success: true, message: 'Usuário excluído com sucesso dos dois ambientes.' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      }
    )
  }
})
