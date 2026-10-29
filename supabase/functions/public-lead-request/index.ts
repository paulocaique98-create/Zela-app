import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { notifyAdmins } from '../_shared/notifyAdmins.ts'
import { logEdgeError } from '../_shared/logEdgeError.ts'

// public-lead-request: endpoint PÚBLICO (sem sessão) do formulário "Quero conhecer a escola"
// (PublicLead.jsx, rota /quero-conhecer?codigo=XXXX). Item 11 do plano de expansão da Gestão.
// Único caminho para um lead entrar sem login: não existe policy de insert para anon.
// Defesas: limite por IP e por escola, escola e módulo `captacao` resolvidos no servidor,
// consentimento LGPD obrigatório, campo isca (honeypot) e tamanhos validados.
// school_id nunca vem do client; só o código público da escola.
const ORIGENS = ['site', 'instagram', 'google', 'indicacao']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const limpa = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
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
      p_key: `edge:public-lead-request:${ip}`, p_limit: 5, p_window_seconds: 600,
    })
    if (ipErr) throw ipErr
    if (!ipOk) return json({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' }, 429)

    const body = await req.json()

    // Isca: robô preenche, pessoa não vê. Responde como sucesso e não grava nada.
    if (typeof body?.website === 'string' && body.website.trim() !== '') return json({ ok: true })

    const codigo = limpa(body?.school_code, 30)
    const nome = limpa(body?.responsavel_nome, 120)
    const telefone = limpa(body?.telefone, 30)
    const email = limpa(body?.email, 160)?.toLowerCase() ?? null
    const criancaNome = limpa(body?.crianca_nome, 120)
    const interesse = limpa(body?.interesse, 120)
    const nascimento = limpa(body?.crianca_nascimento, 10)
    const origem = ORIGENS.includes(body?.origem) ? body.origem : 'site'

    if (!codigo || !nome) throw new Error('Informe o seu nome.')
    if (body?.consentimento !== true) throw new Error('É preciso aceitar o uso dos dados para a escola entrar em contato.')
    const digitos = (telefone ?? '').replace(/\D/g, '')
    if (!telefone && !email) throw new Error('Informe um telefone ou um e-mail para contato.')
    if (telefone && (digitos.length < 8 || digitos.length > 15)) throw new Error('Confira o telefone informado.')
    if (email && !EMAIL.test(email)) throw new Error('Confira o e-mail informado.')

    let nascimentoOk: string | null = null
    if (nascimento) {
      const d = new Date(`${nascimento}T00:00:00Z`)
      const hoje = Date.now()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento) || Number.isNaN(d.getTime())
        || d.getTime() > hoje || d.getTime() < hoje - 25 * 365 * 86400000) {
        throw new Error('Confira a data de nascimento da criança.')
      }
      nascimentoOk = nascimento
    }

    // Mesma mensagem para código errado e para módulo desligado: não confirma nada.
    const indisponivel = 'Este formulário não está disponível. Confirme o link com a escola.'
    const { data: school, error: schoolError } = await adminClient
      .from('schools').select('id, features_enabled').eq('school_code', codigo.toUpperCase()).maybeSingle()
    if (schoolError || !school || school.features_enabled?.captacao !== true) throw new Error(indisponivel)
    const schoolId = school.id as string

    const { data: escolaOk, error: escolaErr } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:public-lead-request:escola:${schoolId}`, p_limit: 60, p_window_seconds: 3600,
    })
    if (escolaErr) throw escolaErr
    if (!escolaOk) return json({ error: 'Recebemos muitos pedidos agora. Tente de novo em instantes.' }, 429)

    const { error: insertError } = await adminClient.from('leads').insert({
      school_id: schoolId,
      responsavel_nome: nome,
      telefone,
      email,
      crianca_nome: criancaNome,
      crianca_nascimento: nascimentoOk,
      interesse,
      origem,
      etapa: 'novo',
      consentimento_em: new Date().toISOString(),
    })
    if (insertError) throw insertError

    try {
      await notifyAdmins(adminClient, {
        schoolId,
        type: 'novo_lead',
        message: `Novo interessado: ${nome}.`,
        url: '/',
        pushTitle: 'Novo interessado na escola',
        pushBody: `${nome} pediu para conhecer a escola.`,
        pushTag: 'novo-lead',
        roles: ['gestao', 'gestao_pedagogica'],
      })
    } catch (notifyErr) {
      console.error('[public-lead-request] falha ao avisar a equipe', notifyErr)
    }

    return json({ ok: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    try {
      if (supabaseUrl && supabaseServiceKey) {
        await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'public-lead-request', msg)
      }
    } catch (_) { /* melhor esforço */ }
    return json({ error: msg }, 400)
  }
})
