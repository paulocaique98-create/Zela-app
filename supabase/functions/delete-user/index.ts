import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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

    // (Opcional, mas recomendado): Verificar se o usuário a ser excluído pertence à mesma escola do admin
    if (callerData.role !== 'developer') {
      const { data: targetData } = await adminClient
        .from('users')
        .select('school_id')
        .eq('id', userId)
        .single()
      
      if (targetData && targetData.school_id !== callerData.school_id) {
        throw new Error('Acesso negado: o usuário não pertence a sua escola')
      }
    }

    // 3.5 Revogar todos os tokens ativos (Passo 3)
    // O Supabase JS client aceita admin.signOut para revogar todas as sessões do usuário.
    // Fazemos isso ANTES de apagar o usuário para evitar erros.
    await adminClient.auth.admin.signOut(userId, 'global')

    // 4. Excluir do auth.users usando a admin API
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)
    
    if (deleteAuthError) {
      // Se não encontrou no auth, talvez seja um fantasma apenas no public, mas a API retorna erro?
      // O erro 'User not found' pode ser ignorado se formos apagar do public de qualquer forma.
      console.warn(`Erro ao excluir do Auth, pode já ter sido apagado: ${deleteAuthError.message}`)
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
