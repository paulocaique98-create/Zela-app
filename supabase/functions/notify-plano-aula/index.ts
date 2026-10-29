import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { sendPush } from '../_shared/push.ts';

// Push do Plano de aula (item 2.5 do PLANO_EXPANSAO_GESTAO).
//  * enviado   -> só a Coordenação e a Gestão da MESMA escola (gestao e
//                 gestao_pedagogica; a Recepção nunca recebe).
//  * devolvido -> só a professora dona do plano.
// O servidor re-busca o plano e confere quem chamou: nada vem do client além
// do id, e a janela de 5 minutos impede reenvio de avisos antigos.
const JANELA_MS = 5 * 60 * 1000;

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
    if (!callerData) throw new Error('Usuário não encontrado');

    const { plan_id } = await req.json();
    if (!plan_id) throw new Error('Campo obrigatório: plan_id');

    const { data: plano } = await adminClient
      .from('lesson_plans')
      .select('id, school_id, teacher_id, turma, status, periodo_inicio, periodo_fim, updated_at, revisado_por, revisado_em')
      .eq('id', plan_id).single();
    if (!plano || plano.school_id !== callerData.school_id) throw new Error('Plano não encontrado');

    const dataBR = (iso: string) => iso.split('-').reverse().join('/');
    const periodo = `${dataBR(plano.periodo_inicio)} a ${dataBR(plano.periodo_fim)}`;
    const recente = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() <= JANELA_MS;

    if (plano.status === 'enviado') {
      if (callerData.role !== 'teacher' || plano.teacher_id !== caller.id) throw new Error('Acesso negado');
      if (!recente(plano.updated_at)) return resposta({ success: true, pushed: 0, motivo: 'fora da janela' });
      const { data: equipe } = await adminClient
        .from('users').select('id')
        .eq('school_id', plano.school_id).in('role', ['gestao', 'gestao_pedagogica']).eq('status', 'active');
      const ids = (equipe || []).map((u: { id: string }) => u.id);
      if (ids.length === 0) return resposta({ success: true, pushed: 0 });
      const { data: prof } = await adminClient.from('users').select('name').eq('id', plano.teacher_id).single();
      const { sent } = await sendPush(adminClient, ids, {
        title: 'Plano de aula para revisar',
        body: `${prof?.name || 'Professor(a)'} enviou o plano de ${plano.turma} (${periodo}).`,
        url: '/',
        tag: 'plano-aula',
      });
      return resposta({ success: true, pushed: sent });
    }

    if (plano.status === 'devolvido') {
      if (!['gestao', 'gestao_pedagogica'].includes(callerData.role) || plano.revisado_por !== caller.id) throw new Error('Acesso negado');
      if (!recente(plano.revisado_em)) return resposta({ success: true, pushed: 0, motivo: 'fora da janela' });
      const { sent } = await sendPush(adminClient, [plano.teacher_id], {
        title: 'Plano de aula devolvido',
        body: `A Coordenação devolveu o plano de ${plano.turma} (${periodo}). Veja o comentário.`,
        url: '/',
        tag: 'plano-aula',
      });
      return resposta({ success: true, pushed: sent });
    }

    return resposta({ success: true, pushed: 0, motivo: 'status sem aviso' });
  } catch (err: any) {
    try {
      await logEdgeError(createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), 'notify-plano-aula', err.message || String(err));
    } catch (_) { /* melhor esforço */ }
    return resposta({ error: err.message }, 400);
  }
});
