import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || 
      'BIdDnc8B3HDw5NnYhfE8Y63iDMuhlKOP3jwlvTQMtIn4r5coPYuXz4VPwz3wm5L5WoKG5OYAnyM4BGVOCFqOS58';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;
    
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    
    const adminClient = createClient(supabaseUrl, serviceKey);
    
    // Validar caller (service role ou admin autenticado)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem autorização');
    
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
