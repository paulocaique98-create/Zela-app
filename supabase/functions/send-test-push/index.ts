import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

// Disparada pelo próprio hook (usePushNotifications.js) logo depois que o
// usuário ativa as notificações, pra ele descobrir NA HORA se o aparelho
// realmente entrega push em segundo plano, em vez de só descobrir dias
// depois quando perder um aviso de check-in de verdade. Manda só pra
// inscrição que acabou de ser criada (endpoint recebido no body), nunca pras
// inscrições antigas do mesmo usuário. Resultado sempre registrado em
// push_delivery_attempts, mesmo mecanismo usado por notify-checkin-request.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { endpoint } = await req.json();
    if (!endpoint) throw new Error('Campo obrigatório: endpoint');

    // Só permite mandar teste pra uma inscrição do PRÓPRIO usuário chamando —
    // impede alguém usar isso pra sondar/incomodar a inscrição de outra pessoa.
    const { data: subscription, error: subError } = await adminClient
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', caller.id)
      .eq('endpoint', endpoint)
      .single();
    if (subError || !subscription) throw new Error('Inscrição não encontrada para este usuário.');

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return new Response(JSON.stringify({ success: false, reason: 'push_nao_configurado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title: 'Notificações ativadas!',
      body: 'Pronto! Você vai receber os avisos do Zela mesmo com o aplicativo fechado.',
      url: '/',
      tag: 'push_teste',
    });

    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload
      );
      await adminClient.from('push_delivery_attempts').insert({
        family_id: caller.id, endpoint: subscription.endpoint, success: true,
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      await adminClient.from('push_delivery_attempts').insert({
        family_id: caller.id, endpoint: subscription.endpoint, success: false,
        status_code: err.statusCode ?? null, error_message: String(err.message ?? err),
      });
      if (err.statusCode === 410 || err.statusCode === 404) {
        await adminClient.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      }
      return new Response(JSON.stringify({ success: false, reason: 'falha_no_envio' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
