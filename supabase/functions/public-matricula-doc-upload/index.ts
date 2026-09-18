import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { logEdgeError } from '../_shared/logEdgeError.ts'

// public-matricula-doc-upload — endpoint PÚBLICO (sem JWT de chamador).
// A conta do responsável ainda não existe nesse ponto do link de Matrícula
// (PublicMatricula.jsx), então a RLS normal do bucket 'matriculas-docs'
// (baseada em auth.uid()) nunca deixaria o upload passar. Em vez disso, essa
// function usa o service role pra gerar uma URL de upload assinada — o
// cliente sobe o arquivo direto pro Storage com ela (uploadToSignedUrl),
// sem precisar de sessão. O path já nasce em `${school_id}/pending-matricula/
// ${request_token}/...`, então a leitura do admin depois (RLS por
// foldername[1] = school_id) funciona igual aos documentos da Rematrícula.
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
      p_key: `edge:public-matricula-doc-upload:${ip}`,
      p_limit: 40,
      p_window_seconds: 600,
    })
    if (rateLimitError) throw rateLimitError
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      })
    }

    const { school_code, request_token, doc_key, file_name } = await req.json()
    if (!school_code || !request_token || !doc_key || !file_name) {
      throw new Error('Campos obrigatórios: school_code, request_token, doc_key, file_name.')
    }
    // request_token vem do próprio cliente (crypto.randomUUID()) — valida o
    // formato pra evitar virar um jeito de escrever em qualquer path.
    if (!/^[a-zA-Z0-9-]{10,80}$/.test(request_token)) {
      throw new Error('Token de solicitação inválido.')
    }
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(doc_key)) {
      throw new Error('Documento inválido.')
    }

    const { data: school, error: schoolError } = await adminClient
      .from('schools')
      .select('id')
      .eq('school_code', school_code.trim().toUpperCase())
      .maybeSingle()
    if (schoolError || !school) {
      throw new Error('Código de escola inválido. Confirme com a secretaria da escola.')
    }

    const ext = (file_name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const path = `${school.id}/pending-matricula/${request_token}/${doc_key}-${safeName}`

    const { data: signed, error: signedError } = await adminClient
      .storage
      .from('matriculas-docs')
      .createSignedUploadUrl(path)
    if (signedError || !signed) {
      throw new Error(`Não foi possível preparar o envio do arquivo: ${signedError?.message || 'erro desconhecido'}`)
    }

    return new Response(JSON.stringify({ success: true, path: signed.path, token: signed.token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'public-matricula-doc-upload', error.message || String(error))
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
