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

    // 1. Criar client com SERVICE_ROLE
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Extrair JWT e validar caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Sem token de autorização')
    }
    const token = authHeader.replace('Bearer ', '')

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token)
    if (callerError || !caller) {
      throw new Error('Token inválido ou expirado')
    }

    // Buscar no public.users a role e school do caller
    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users')
      .select('role, school_id')
      .eq('id', caller.id)
      .single()

    if (dbCallerError || !callerData) {
      throw new Error('Usuário não encontrado no banco')
    }

    // 3. Obter os dados da requisição
    const { 
      name, 
      email, 
      password, 
      phone, 
      doc_number, 
      school_id, 
      student_ids, 
      relationship, 
      is_financial 
    } = await req.json()
    
    if (!name || !email || !password || !school_id || !student_ids || student_ids.length === 0) {
      throw new Error('Dados incompletos. Informe name, email, password, school_id e student_ids.')
    }
    
    // Validar se o caller pertence à mesma escola do usuário que está sendo criado
    if (callerData.role !== 'developer' && callerData.school_id !== school_id) {
      throw new Error('Acesso negado: a escola do usuário não corresponde a sua escola')
    }
    
    if (callerData.role !== 'developer' && callerData.role !== 'admin' && callerData.role !== 'family') {
      throw new Error('Acesso negado: você não tem permissão para criar guardiões')
    }

    // 4. Criar o usuário no Auth
    const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { 
        name,
        role: 'family',
        school_id: school_id
      }
    })
    
    if (authError || !newAuthUser.user) {
      throw new Error(`Erro ao criar conta: ${authError?.message || 'Erro desconhecido'}`)
    }
    
    const newUserId = newAuthUser.user.id

    // 5. Inserir em public.users
    const { error: publicUserError } = await adminClient
      .from('users')
      .insert({
        id: newUserId,
        name,
        email,
        phone: phone || null,
        doc_number: doc_number || null,
        role: 'family',
        school_id
      })
      
    if (publicUserError) {
      // Rollback se falhar
      await adminClient.auth.admin.deleteUser(newUserId)
      throw new Error(`Erro ao salvar no banco público: ${publicUserError.message}`)
    }
    
    // 6. Inserir em student_guardians
    const guardianLinks = student_ids.map((sId: string) => ({
      student_id: sId,
      guardian_id: newUserId,
      school_id,
      is_primary: false,
      is_financial: is_financial || false,
      relationship: relationship || 'Responsável'
    }))
    
    const { error: guardianError } = await adminClient
      .from('student_guardians')
      .insert(guardianLinks)
      
    if (guardianError) {
      throw new Error(`Erro ao vincular aos alunos: ${guardianError.message}`)
    }

    return new Response(JSON.stringify({ success: true, user: newAuthUser.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
