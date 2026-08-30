import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { processPaymentEvent } from '../_shared/processPaymentEvent.ts';

// Fase 9 — reprocessamento manual/backfill: varre payment_webhook_events
// com processed_at IS NULL e tenta sincronizar cada um pra financial_charges
// (mesma lógica que payment-webhook já roda automaticamente pra eventos
// novos — esta function existe pra reprocessar eventos que falharam ou
// chegaram antes do contrato existir). Uso: admin/developer, sob demanda.
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

    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users')
      .select('role, school_id')
      .eq('id', caller.id)
      .single();
    if (dbCallerError || !callerData || (callerData.role !== 'admin' && callerData.role !== 'developer')) {
      throw new Error('Acesso negado.');
    }

    // Admin só reprocessa eventos da PRÓPRIA escola; developer pode
    // reprocessar de qualquer uma (passando school_id no corpo).
    const body = await req.json().catch(() => ({}));
    const targetSchoolId = callerData.role === 'developer' && body.school_id ? body.school_id : callerData.school_id;

    const { data: pending, error: pendingError } = await adminClient
      .from('payment_webhook_events')
      .select('*')
      .eq('school_id', targetSchoolId)
      .is('processed_at', null)
      .order('received_at', { ascending: true })
      .limit(50);
    if (pendingError) throw pendingError;

    const results = [];
    for (const row of pending || []) {
      try {
        const result = await processPaymentEvent(adminClient, row);
        results.push({ event_id: row.gateway_event_id, ...result });
      } catch (err) {
        results.push({ event_id: row.gateway_event_id, processed: false, reason: err.message });
      }
    }

    return new Response(JSON.stringify({ total: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
