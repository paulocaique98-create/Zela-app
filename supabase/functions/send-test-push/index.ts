import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { sendPush } from '../_shared/push.ts';

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
      .select('endpoint')
      .eq('user_id', caller.id)
      .eq('endpoint', endpoint)
      .single();
    if (subError || !subscription) throw new Error('Inscrição não encontrada para este usuário.');

    const { sent } = await sendPush(adminClient, [caller.id], {
      title: 'Notificações ativadas!',
      body: 'Pronto! Você vai receber os avisos do Zela mesmo com o aplicativo fechado.',
      url: '/',
      tag: 'push_teste',
    }, { onlyEndpoint: subscription.endpoint });
    return new Response(JSON.stringify(sent > 0 ? { success: true } : { success: false, reason: 'falha_no_envio' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'send-test-push', err.message || String(err));
    } catch (_) { /* melhor esforço */ }
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
