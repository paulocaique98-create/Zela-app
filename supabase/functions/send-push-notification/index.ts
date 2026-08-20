import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;
    
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    
    const adminClient = createClient(supabaseUrl, serviceKey);
    
    // Validar caller: só a service role (triggers/backend) pode disparar push notifications,
    // nunca clientes anônimos ou usuários finais — do contrário qualquer chamador poderia
    // enviar push arbitrário para qualquer user_id (spam/phishing) só com um header não-vazio.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token || token !== serviceKey) {
      throw new Error('Não autorizado');
    }

    const { user_id, title, body, url, tag } = await req.json();
    
    if (!user_id || !title || !body) {
      throw new Error('Campos obrigatórios: user_id, title, body');
    }
    
    // Buscar todas as subscriptions do usuário
    const { data: subscriptions, error } = await adminClient
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user_id);
    
    if (error) throw error;
    if (!subscriptions?.length) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'Sem subscriptions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const payload = JSON.stringify({ title, body, url: url || '/', tag: tag || 'zela' });
    
    let sent = 0;
    const errors = [];
    
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        // 410 = subscription expirada, remover do banco
        if (err.statusCode === 410 || err.statusCode === 404) {
          await adminClient
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
        }
        errors.push(err.message);
      }
    }
    
    return new Response(
      JSON.stringify({ success: true, sent, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
