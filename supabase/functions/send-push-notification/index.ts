import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { sendPush } from '../_shared/push.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
    
    const { sent, errors } = await sendPush(adminClient, [user_id], { title, body, url: url || '/', tag: tag || 'zela' });
    
    return new Response(
      JSON.stringify({ success: true, sent, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'send-push-notification', err.message || String(err));
    } catch (_) { /* melhor esforço */ }
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
