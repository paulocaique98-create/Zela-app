import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

// Notifica (in-app, quando o destinatário é família + push, sempre que houver
// subscription) quando uma nova mensagem chega numa conversa do chat interno.
// Bidirecional: família -> admins do setor (ou developer, se for suporte_zela),
// e admin/developer -> a família da conversa. Re-busca a thread e a última
// mensagem no servidor (nunca confia no texto que o client mandaria) para
// evitar que alguém forje o preview de outra pessoa.
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

    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users')
      .select('role, school_id, departamento, chat_visibilidade_total')
      .eq('id', caller.id)
      .single();
    if (dbCallerError || !callerData) throw new Error('Usuário não encontrado');

    const { thread_id } = await req.json();
    if (!thread_id) throw new Error('Campo obrigatório: thread_id');

    const { data: thread, error: threadError } = await adminClient
      .from('chat_threads')
      .select('id, school_id, family_id, setor')
      .eq('id', thread_id)
      .single();
    if (threadError || !thread) throw new Error('Conversa não encontrada');

    // Valida que o caller realmente participa dessa conversa antes de disparar
    // qualquer notificação — mesma regra da RLS, checada de novo aqui.
    const isFamilyOwner = callerData.role === 'family' && thread.family_id === caller.id;
    const isSuporteZela = thread.setor === 'suporte_zela';
    const isDeveloperOwner = callerData.role === 'developer' && isSuporteZela;
    const isAdminOwner = callerData.role === 'admin' && !isSuporteZela
      && thread.school_id === callerData.school_id
      && (callerData.chat_visibilidade_total || callerData.departamento === thread.setor);

    if (!isFamilyOwner && !isDeveloperOwner && !isAdminOwner) {
      throw new Error('Acesso negado a esta conversa');
    }

    const { data: lastMessage, error: msgError } = await adminClient
      .from('chat_messages')
      .select('body, sender_role')
      .eq('thread_id', thread_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (msgError || !lastMessage) throw new Error('Nenhuma mensagem encontrada nessa conversa');

    const SETOR_LABELS: Record<string, string> = {
      administrativo: 'Administrativo',
      diretoria_pedagogica: 'Diretoria Pedagógica',
      coordenacao: 'Coordenação',
      recepcao: 'Recepção',
      suporte_zela: 'Suporte Zela',
    };

    let recipientIds: string[] = [];
    let title = '';
    let notifyInApp = false;

    if (lastMessage.sender_role === 'family') {
      // Família mandou -> notifica o(s) responsável(is) do lado da escola/Zela.
      title = `Nova mensagem no chat (${SETOR_LABELS[thread.setor] || thread.setor})`;
      if (isSuporteZela) {
        const { data: devs } = await adminClient.from('users').select('id').eq('role', 'developer');
        recipientIds = (devs || []).map((d: { id: string }) => d.id);
      } else {
        const { data: staff } = await adminClient
          .from('users')
          .select('id')
          .eq('school_id', thread.school_id)
          .eq('role', 'admin')
          .or(`chat_visibilidade_total.eq.true,departamento.eq.${thread.setor}`);
        recipientIds = (staff || []).map((s: { id: string }) => s.id);
      }
    } else {
      // Escola/Zela respondeu -> notifica a família (com registro in-app, já que
      // ela tem um sininho de notificações; admin/developer não têm essa caixa).
      title = 'Nova resposta no chat';
      recipientIds = [thread.family_id];
      notifyInApp = true;
    }

    recipientIds = recipientIds.filter((id: string) => id !== caller.id);
    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, pushed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (notifyInApp) {
      await adminClient.from('notifications').insert(recipientIds.map((family_id: string) => ({
        school_id: thread.school_id,
        family_id,
        student_id: null,
        type: 'chat',
        message: title,
      })));
    }

    let pushed = 0;
    if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      const { data: subscriptions } = await adminClient
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, user_id')
        .in('user_id', recipientIds);

      if (subscriptions?.length) {
        const payload = JSON.stringify({
          title,
          body: lastMessage.body.length > 120 ? `${lastMessage.body.slice(0, 117)}...` : lastMessage.body,
          url: '/',
          tag: 'chat',
        });
        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            pushed++;
          } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await adminClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, notified: recipientIds.length, pushed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
