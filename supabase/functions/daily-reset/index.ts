import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const reqAuth = req.headers.get('Authorization')

    // Basic security check to prevent unauthorized external calls
    if (reqAuth !== `Bearer ${supabaseKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL ou Key faltando.')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Reseta todos os alunos para 'idle' e remove os registros de entrada/saída do dia atual
    // Filtra apenas aqueles que já não estão no estado inicial para não rodar um update gigante à toa
    const { data, error } = await supabase
      .from('students')
      .update({ status: 'idle', today_entry: null, today_exit: null })
      .or('status.neq.idle,today_entry.not.is.null,today_exit.not.is.null')
      .select('id')

    if (error) throw error

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Reset diário concluído com sucesso.',
      studentsUpdated: data?.length || 0
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
