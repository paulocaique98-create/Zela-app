import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { logEdgeError } from '../_shared/logEdgeError.ts'

// Fase E do PLANO_LOGGING_ERROS_PORTAL_DEV.md — fecha o gap documentado em
// OBSERVABILIDADE.md ("não há alerta automático"). Chamada pelo trigger
// notify_critical_error_log (ver migration da Fase E) só quando uma linha
// NOVA (não um incremento de occurrences) entra em error_logs com
// severity='critical', com rate-limit de 10 minutos já aplicado no próprio
// trigger -- esta function nunca precisa se preocupar com volume, só envia.
//
// Notificação é só push (via VAPID) pros usuários role='developer' -- a
// tabela `notifications` (in-app) exige school_id NOT NULL e é lida com RLS
// escopada por escola, então não serve pra avisar "a equipe Zela" como um
// todo sem uma mudança de schema maior; push já é o canal que efetivamente
// avisa alguém que não está com a tela aberta, que é o objetivo aqui.
serve(async (req) => {
  try {
    const authKey = Deno.env.get('NOTIFY_CRITICAL_ERROR_AUTH_KEY')
    const reqAuth = req.headers.get('Authorization')
    if (!authKey || reqAuth !== `Bearer ${authKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const source = String(body.source ?? 'desconhecido')
    const category = String(body.category ?? 'desconhecido')
    const message = String(body.message ?? '(sem mensagem)').slice(0, 160)

    const { data: developers, error: devError } = await adminClient
      .from('users')
      .select('id')
      .eq('role', 'developer')
    if (devError) throw devError
    if (!developers || developers.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'nenhum developer cadastrado' }), { headers: { 'Content-Type': 'application/json' } })
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')
    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'VAPID não configurado' }), { headers: { 'Content-Type': 'application/json' } })
    }

    const developerIds = developers.map((d: { id: string }) => d.id)
    const { data: subscriptions } = await adminClient
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('user_id', developerIds)

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'nenhuma subscription de push' }), { headers: { 'Content-Type': 'application/json' } })
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    const payload = JSON.stringify({
      title: 'Erro crítico no Zela',
      body: `${source} · ${category}: ${message}`,
      url: '/',
      tag: 'critical-error-log',
    })

    let notified = 0
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        notified++
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await adminClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }

    return new Response(JSON.stringify({ success: true, notified }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'notify-critical-error', err.message || String(err))
    } catch (_) { /* melhor esforço */ }

    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
