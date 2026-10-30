import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { logEdgeError } from '../_shared/logEdgeError.ts'

// Verificação pública de histórico escolar e declarações (item 12 do plano de expansão da Gestão).
// Quem tem o código impresso no documento confere se ele é válido. Devolve só o nome da escola,
// o tipo, a data e a situação (válido ou cancelado): nunca dado do aluno.
// Defesas: limite de tentativas por IP e no total (contra varredura de códigos), código com formato
// fixo e resposta igual para "não existe" e "código malformado".

const TIPOS: Record<string, string> = {
  historico: 'Histórico escolar',
  declaracao_matricula: 'Declaração de matrícula',
  declaracao_escolaridade: 'Declaração de escolaridade',
  ficha_acompanhamento: 'Ficha de acompanhamento',
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  try {
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Ambiente não configurado corretamente.')
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { data: ipOk, error: ipErr } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:verify-document:${ip}`, p_limit: 20, p_window_seconds: 600,
    })
    if (ipErr) throw ipErr
    if (!ipOk) return json({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' }, 429)

    const { data: globalOk, error: globalErr } = await adminClient.rpc('check_rate_limit', {
      p_key: 'edge:verify-document:global', p_limit: 600, p_window_seconds: 600,
    })
    if (globalErr) throw globalErr
    if (!globalOk) return json({ error: 'Serviço ocupado. Tente novamente em alguns minutos.' }, 429)

    const body = await req.json().catch(() => ({}))
    const codigo = typeof body?.codigo === 'string'
      ? body.codigo.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 32)
      : ''
    if (!/^[0-9A-F]{16}$/.test(codigo)) return json({ encontrado: false })

    const { data, error } = await adminClient.rpc('documentos_verificar', { p_codigo: codigo })
    if (error) throw error
    const linha = Array.isArray(data) ? data[0] : null
    if (!linha) return json({ encontrado: false })

    return json({
      encontrado: true,
      escola: linha.escola,
      tipo: TIPOS[linha.tipo] ?? 'Documento escolar',
      emitido_em: linha.emitido_em,
      situacao: linha.situacao === 'valido' ? 'valido' : 'cancelado',
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    try {
      if (supabaseUrl && supabaseServiceKey) {
        await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'verify-document', msg)
      }
    } catch (_) { /* melhor esforço */ }
    return json({ error: 'Não foi possível verificar agora. Tente novamente.' }, 500)
  }
})
