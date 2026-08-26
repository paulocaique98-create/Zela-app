import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

// Notifica (in-app + push) as famílias de uma escola quando o admin publica
// uma novidade (comunicado, foto no mural, evento no calendário, cardápio).
// Chamada pelo próprio admin logado (não pelo service role) — a autorização é
// verificada aqui a partir do JWT do caller, no mesmo padrão de delete-user.
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
    if (dbCallerError || !callerData || callerData.role !== 'admin') {
      throw new Error('Acesso negado: apenas administradores podem notificar as famílias.');
    }

    const { type, title, message, url, turmas, family_ids } = await req.json();
    if (!type || !title || !message) {
      throw new Error('Campos obrigatórios: type, title, message');
    }
    const schoolId = callerData.school_id;

    // Resolve as famílias-alvo: destinatários explícitos (ex: dono de uma
    // solicitação específica de matrícula), só as com filho em alguma das
    // turmas informadas, ou todas as famílias da escola.
    let familyIds: string[];
    if (Array.isArray(family_ids) && family_ids.length > 0) {
      // Ainda validamos que os ids pertencem à mesma escola do caller, pra um
      // admin não conseguir notificar (in-app + push) usuários de outra escola.
      const { data: verified, error: verifiedError } = await adminClient
        .from('users')
        .select('id')
        .eq('school_id', schoolId)
        .in('id', family_ids);
      if (verifiedError) throw verifiedError;
      familyIds = (verified || []).map(u => u.id);
    } else if (Array.isArray(turmas) && turmas.length > 0) {
      const { data: students, error: studentsError } = await adminClient
        .from('students')
        .select('id, turma, family_id')
        .eq('school_id', schoolId)
        .in('turma', turmas);
      if (studentsError) throw studentsError;

      const studentIds = (students || []).map(s => s.id);
      const idSet = new Set<string>();
      (students || []).forEach(s => { if (s.family_id) idSet.add(s.family_id); });

      if (studentIds.length > 0) {
        const { data: guardians, error: guardiansError } = await adminClient
          .from('student_guardians')
          .select('guardian_id')
          .in('student_id', studentIds);
        if (guardiansError) throw guardiansError;
        (guardians || []).forEach(g => idSet.add(g.guardian_id));
      }
      familyIds = Array.from(idSet);
    } else {
      const { data: families, error: familiesError } = await adminClient
        .from('users')
        .select('id')
        .eq('school_id', schoolId)
        .eq('role', 'family');
      if (familiesError) throw familiesError;
      familyIds = (families || []).map(f => f.id);
    }

    // Responsável cujo(s) filho(s) ainda não tiveram o 1º check-in real fica
    // de fora dos avisos gerais do sistema (cardápio, mural, comunicados,
    // calendário, diário) — só passa a receber a partir da liberação (ver
    // is_guardian_released() e o trigger notify_on_attendance(), que fazem
    // essa mesma checagem pro lado do check-in/check-out).
    const releaseChecks = await Promise.all(
      familyIds.map(id => adminClient.rpc('is_guardian_released', { p_guardian_id: id }))
    );
    familyIds = familyIds.filter((_, i) => releaseChecks[i].data === true);

    if (familyIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notified: 0, pushed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Notificação in-app (sempre criada, independente de push estar ativo)
    const { error: insertError } = await adminClient
      .from('notifications')
      .insert(familyIds.map(family_id => ({
        school_id: schoolId,
        family_id,
        student_id: null,
        type,
        message: title,
        url: url || null,
      })));
    if (insertError) throw insertError;

    // 2. Push (best-effort — falha de push não deve derrubar a notificação in-app)
    let pushed = 0;
    if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

      const { data: subscriptions, error: subsError } = await adminClient
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, user_id')
        .in('user_id', familyIds);

      if (!subsError && subscriptions?.length) {
        const payload = JSON.stringify({ title, body: message, url: url || '/', tag: type });
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

    return new Response(
      JSON.stringify({ success: true, notified: familyIds.length, pushed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
