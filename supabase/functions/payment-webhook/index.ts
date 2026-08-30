import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { processPaymentEvent } from '../_shared/processPaymentEvent.ts';

// Fase 8 — Webhook do Asaas, multi-tenant (Opção A: 1 conta Asaas por
// escola). Como cada escola tem sua PRÓPRIA conta, cada uma configura seu
// PRÓPRIO webhook no painel dela (mesma URL do Zela pras duas, `authToken`
// diferente por escola) — e o Asaas não manda "de qual escola" no corpo do
// evento. Descobrimos isso comparando o token recebido contra os segredos
// de webhook guardados por escola (find_school_by_webhook_token, SQL,
// SECURITY DEFINER — a comparação roda dentro do Postgres).
//
// Diferente de toda outra Edge Function do projeto: quem chama aqui NÃO é
// um usuário logado do Zela, é o servidor do Asaas. Por isso essa function
// é implantada com verify_jwt = false (ver supabase/config.toml).
//
// Sem CORS de propósito: chamada servidor-a-servidor do gateway, não vem
// de navegador.
//
// Formato real do payload do Asaas (confirmado na Fase 3):
// { "id": "evt_...", "event": "PAYMENT_RECEIVED", "dateCreated": "...", "payment": {...} }

const JSON_HEADERS = { 'Content-Type': 'application/json' };

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Header real do Asaas (confirmado na Fase 3) — o valor é o `authToken`
    // que CADA escola define ao criar o webhook dela no painel Asaas, nunca
    // a chave de API.
    const providedToken = req.headers.get('asaas-access-token') || '';
    if (!providedToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
    }

    const { data: schoolId, error: lookupError } = await adminClient.rpc('find_school_by_webhook_token', {
      p_gateway: 'asaas_webhook',
      p_token: providedToken,
    });
    if (lookupError) {
      console.error('[payment-webhook] Erro ao resolver escola pelo token:', lookupError);
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: JSON_HEADERS });
    }
    if (!schoolId) {
      // Token não bate com nenhuma escola cadastrada — mesma resposta
      // genérica de token ausente, não vaza se o token "quase" bateu.
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
    }

    // Rate limit por escola (Fase 4, risco 6.11; implementado na Fase 15) —
    // limite generoso (o Asaas pode reenviar retries em rajada legítima),
    // só pra barrar martelamento óbvio contra o endpoint.
    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:payment-webhook:${schoolId}`,
      p_limit: 120,
      p_window_seconds: 300,
    });
    if (rateLimitError) {
      console.error('[payment-webhook] Erro ao checar rate limit:', rateLimitError);
    } else if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Rate limit excedido' }), { status: 429, headers: JSON_HEADERS });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS });
    }

    const gatewayEventId = body.id;
    const eventType = body.event;
    if (!gatewayEventId || typeof gatewayEventId !== 'string' || !eventType || typeof eventType !== 'string') {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios: id, event' }), { status: 400, headers: JSON_HEADERS });
    }

    // Grava o evento cru ANTES de qualquer processamento. A unique key
    // (school_id, gateway, gateway_event_id) resolve a idempotência: se o
    // Asaas reenviar o mesmo evento, esse insert simplesmente não duplica
    // nada (upsert com ignoreDuplicates) — não importa a ordem de chegada,
    // cada evento é gravado (ou identificado como já visto) de forma
    // independente.
    const { data: inserted, error: insertError } = await adminClient
      .from('payment_webhook_events')
      .upsert(
        {
          school_id: schoolId,
          gateway: 'asaas',
          gateway_event_id: gatewayEventId,
          event_type: eventType,
          payload: body,
        },
        { onConflict: 'school_id,gateway,gateway_event_id', ignoreDuplicates: true }
      )
      .select('*')
      .maybeSingle();

    if (insertError) throw insertError;

    const isDuplicate = !inserted;

    // Fase 9: sincroniza pra financial_charges — só pra eventos NOVOS
    // (reenvio de um evento já visto não reprocessa nada de novo, evita
    // trabalho duplicado e granularidade de erro desnecessária). Falha na
    // sincronização não derruba a resposta 200 pro Asaas — o evento cru já
    // está gravado e pode ser reprocessado depois via process-payment-webhook;
    // preferível a fazer o Asaas re-tentar o webhook inteiro por um erro
    // que é nosso, não dele.
    if (inserted) {
      try {
        await processPaymentEvent(adminClient, inserted);
      } catch (syncErr) {
        console.error('[payment-webhook] Erro ao sincronizar evento pra financial_charges:', syncErr);
      }
    }

    // Responde rápido com 200 pra não entrar em fila de retry do Asaas à toa.
    return new Response(JSON.stringify({ received: true, duplicate: isDuplicate }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[payment-webhook] Erro ao processar webhook:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: JSON_HEADERS });
  }
});
