import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { sendPush } from '../_shared/push.ts';

// Push de Pesquisas (item 8 do PLANO_EXPANSAO_GESTAO). Avisa o público quando a
// Gestão publica a pesquisa. O servidor re-busca a pesquisa e confere quem chamou:
// só gestao e gestao_pedagogica, da mesma escola, e só quem criou a pesquisa.
// Cada pesquisa avisa uma vez só (notificada_em). O público é calculado aqui, na
// escola da pesquisa, nunca a partir do que o cliente mandou. Nada do conteúdo
// da pesquisa vai no push.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const resposta = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData } = await adminClient.from('users').select('role, school_id').eq('id', caller.id).single();
    if (!callerData || !['gestao', 'gestao_pedagogica'].includes(callerData.role)) throw new Error('Acesso negado');

    const { survey_id } = await req.json();
    if (!survey_id || typeof survey_id !== 'string') throw new Error('Campo obrigatório: survey_id');

    const { data: sv } = await adminClient
      .from('surveys')
      .select('id, school_id, publico, turmas, status, abre_em, fecha_em, notificada_em, created_by')
      .eq('id', survey_id).single();
    if (!sv || sv.school_id !== callerData.school_id || sv.created_by !== caller.id) throw new Error('Pesquisa não encontrada');
    if (sv.status !== 'publicada' || new Date(sv.fecha_em).getTime() <= Date.now()) {
      return resposta({ success: true, pushed: 0, motivo: 'pesquisa não está aberta' });
    }
    if (sv.notificada_em) return resposta({ success: true, pushed: 0, motivo: 'já notificada' });

    const { data: escola } = await adminClient.from('schools').select('features_enabled').eq('id', sv.school_id).single();
    if (escola?.features_enabled?.avaliacao_institucional !== true) return resposta({ success: true, pushed: 0, motivo: 'módulo desligado' });

    // Marca antes de enviar: duas chamadas ao mesmo tempo não avisam duas vezes.
    const { data: marcada } = await adminClient
      .from('surveys').update({ notificada_em: new Date().toISOString() })
      .eq('id', sv.id).is('notificada_em', null).select('id');
    if (!marcada || marcada.length === 0) return resposta({ success: true, pushed: 0, motivo: 'já notificada' });

    let ids: string[] = [];
    if (sv.publico === 'equipe') {
      const { data } = await adminClient.from('users').select('id')
        .eq('school_id', sv.school_id).eq('role', 'teacher').eq('teacher_status', 'ativo').eq('status', 'active');
      ids = (data || []).map((u: { id: string }) => u.id);
    } else if (sv.publico === 'familias') {
      const { data } = await adminClient.from('users').select('id')
        .eq('school_id', sv.school_id).eq('role', 'family').eq('status', 'active');
      ids = (data || []).map((u: { id: string }) => u.id);
    } else {
      const { data: alunos } = await adminClient.from('students').select('id, family_id')
        .eq('school_id', sv.school_id).in('turma', sv.turmas || []);
      const alunoIds = (alunos || []).map((a: { id: string }) => a.id);
      const { data: resp } = alunoIds.length
        ? await adminClient.from('student_guardians').select('guardian_id').eq('school_id', sv.school_id).in('student_id', alunoIds)
        : { data: [] };
      ids = [...new Set([
        ...(alunos || []).map((a: { family_id: string | null }) => a.family_id),
        ...(resp || []).map((r: { guardian_id: string }) => r.guardian_id),
      ].filter(Boolean))] as string[];
    }
    ids = ids.filter((id) => id !== caller.id);
    if (ids.length === 0) return resposta({ success: true, pushed: 0 });

    const { sent } = await sendPush(adminClient, ids, {
      title: 'Nova pesquisa da escola',
      body: 'Sua opinião é importante. Abra o Zela para responder.',
      url: '/',
      tag: 'pesquisa',
    });
    return resposta({ success: true, pushed: sent });
  } catch (err: any) {
    try {
      await logEdgeError(createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), 'notify-pesquisa', err.message || String(err));
    } catch (_) { /* melhor esforço */ }
    return resposta({ error: err.message }, 400);
  }
});
