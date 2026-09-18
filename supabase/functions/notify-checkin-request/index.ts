import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';

// Notifica (in-app + push) os responsáveis de UM aluno em dois momentos:
//   - SOLICITAÇÃO (pending_entry/pending_exit): assim que o reconhecimento
//     facial/PIN acontece no Autoatendimento, antes da escola confirmar. A
//     confirmação pode demorar horas (a recepção não fica o tempo todo
//     olhando o Monitor); a família precisa saber que a criança
//     chegou/está saindo no minuto em que o reconhecimento acontece.
//   - CONFIRMAÇÃO (in_school/left): quando a escola de fato confirma o
//     check-in/check-out. Antes disso era feito só por um trigger de banco
//     (notify_on_attendance, removido — ver migration
//     20260930_drop_attendance_notify_trigger.sql), que só conseguia criar a
//     notificação in-app, sem enviar push nenhum — a família só ficava
//     sabendo se o app estivesse aberto naquele instante.
//
// Diferente de notify-families: aqui NÃO aplicamos o "release gate"
// (is_guardian_released) — esse gate existe pra não bombardear a família com
// avisos gerais (cardápio, mural) antes do 1º check-in de verdade, mas o
// PRÓPRIO check-in/check-out nunca deve ser silenciado, com uma exceção
// (ver "primeiro check-in do aluno" abaixo, mesma regra que já existia no
// trigger antigo).
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
      .select('role, school_id')
      .eq('id', caller.id)
      .single();
    // Quem opera o Autoatendimento (kiosk embutido no painel, ou totem físico
    // logado como admin) é sempre um admin da escola — mesma checagem de
    // notify-families.
    if (dbCallerError || !callerData || callerData.role !== 'admin') {
      throw new Error('Acesso negado: apenas administradores podem disparar esta notificação.');
    }
    const schoolId = callerData.school_id;

    // Rate limit por admin: cada reconhecimento no totem dispara no máximo 1
    // chamada por aluno, mas protege contra loop de bug/abuso do dispositivo.
    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:notify-checkin-request:${caller.id}`,
      p_limit: 120,
      p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas solicitações em pouco tempo.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      });
    }

    const { student_id, event_type } = await req.json();
    const VALID_EVENT_TYPES = ['pending_entry', 'pending_exit', 'in_school', 'left'];
    if (!student_id || !VALID_EVENT_TYPES.includes(event_type)) {
      throw new Error('Campos obrigatórios: student_id, event_type (pending_entry|pending_exit|in_school|left)');
    }
    const isConfirmation = event_type === 'in_school' || event_type === 'left';

    const { data: student, error: studentError } = await adminClient
      .from('students')
      .select('id, name, family_id, school_id, first_checkin_at')
      .eq('id', student_id)
      .eq('school_id', schoolId) // garante que o admin só notifica alunos da própria escola
      .single();
    if (studentError || !student) throw new Error('Aluno não encontrado nesta escola.');

    let type: string;
    let title: string;
    let message: string;

    if (isConfirmation) {
      const isEntry = event_type === 'in_school';
      type = isEntry ? 'checkin_confirmed' : 'checkout_confirmed';
      title = isEntry ? 'Check-in confirmado' : 'Check-out confirmado';
      message = isEntry
        ? `O check-in de ${student.name} foi confirmado.`
        : `O check-out de ${student.name} foi confirmado.`;

      // Mesma regra do trigger antigo: o 1º check-in de cada aluno (nunca
      // teve first_checkin_at) libera as notificações dele daqui pra frente,
      // mas o evento em si fica silencioso — evita bombardear a família com
      // o aviso de sistema justo na primeira vez que a criança frequenta.
      if (isEntry && !student.first_checkin_at) {
        await adminClient.from('students').update({ first_checkin_at: new Date().toISOString() }).eq('id', student.id);
        return new Response(JSON.stringify({ success: true, notified: 0, pushed: 0, silenced: 'primeiro_checkin' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Saída sem nenhum check-in já registrado antes (caso de borda) — o
      // trigger antigo também ficava calado aqui.
      if (!isEntry && !student.first_checkin_at) {
        return new Response(JSON.stringify({ success: true, notified: 0, pushed: 0, silenced: 'sem_checkin_anterior' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const isEntry = event_type === 'pending_entry';
      type = isEntry ? 'checkin_requested' : 'checkout_requested';
      title = isEntry ? 'Chegada detectada' : 'Saída detectada';
      message = isEntry
        ? `${student.name} chegou e aguarda confirmação da recepção.`
        : `${student.name} está saindo e aguarda confirmação da recepção.`;
    }

    // Resolve todos os responsáveis vinculados (1º e 2º), com fallback pro
    // family_id direto do aluno — mesmo padrão do trigger notify_on_attendance.
    const { data: guardianLinks, error: guardiansError } = await adminClient
      .from('student_guardians')
      .select('guardian_id')
      .eq('student_id', student.id);
    if (guardiansError) throw guardiansError;

    const familyIds = new Set<string>((guardianLinks || []).map(g => g.guardian_id));
    if (student.family_id) familyIds.add(student.family_id);

    if (familyIds.size === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, pushed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const familyIdList = Array.from(familyIds);

    // 1. Notificação in-app (sempre criada, independente de push estar ativo)
    const { error: insertError } = await adminClient
      .from('notifications')
      .insert(familyIdList.map(family_id => ({
        school_id: schoolId,
        family_id,
        student_id: student.id,
        type,
        message,
      })));
    if (insertError) throw insertError;

    // 2. Push (best-effort — falha de push não deve impedir a notificação in-app)
    let pushed = 0;
    if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

      const { data: subscriptions, error: subsError } = await adminClient
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, user_id')
        .in('user_id', familyIdList);

      if (!subsError && subscriptions?.length) {
        const payload = JSON.stringify({ title, body: message, url: '/', tag: type });
        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            pushed++;
            await adminClient.from('push_delivery_attempts').insert({
              family_id: sub.user_id, endpoint: sub.endpoint, success: true,
            });
          } catch (err: any) {
            await adminClient.from('push_delivery_attempts').insert({
              family_id: sub.user_id, endpoint: sub.endpoint, success: false,
              status_code: err.statusCode ?? null, error_message: String(err.message ?? err),
            });
            if (err.statusCode === 410 || err.statusCode === 404) {
              await adminClient.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified: familyIdList.length, pushed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'notify-checkin-request', err.message || String(err));
    } catch (_) { /* melhor esforço */ }
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
