import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { sendPush } from '../_shared/push.ts';

// Push de Ocorrências (item 7 do PLANO_EXPANSAO_GESTAO).
//  * família   -> só se a ocorrência é visível à família; vai para os
//                 responsáveis vinculados ao aluno (family_id e student_guardians).
//  * Coordenação -> se a gravidade é grave, para gestao e gestao_pedagogica da
//                 MESMA escola (a Recepção nunca recebe), exceto quem registrou.
// O servidor re-busca a ocorrência e confere quem chamou: só quem registrou
// pode disparar, só na escola dele e só nos 5 minutos seguintes ao registro.
// Nada do conteúdo da ocorrência vai no push: o texto fica dentro do app.
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

    const { incident_id } = await req.json();
    if (!incident_id) throw new Error('Campo obrigatório: incident_id');

    const { data: oc } = await adminClient
      .from('student_incidents')
      .select('id, school_id, student_id, tipo, gravidade, visivel_familia, exige_ciencia, registrado_por, created_at')
      .eq('id', incident_id).single();
    if (!oc || oc.school_id !== callerData.school_id || oc.registrado_por !== caller.id) throw new Error('Ocorrência não encontrada');
    if (!['teacher', 'gestao', 'gestao_pedagogica'].includes(callerData.role)) throw new Error('Acesso negado');

    const { data: escola } = await adminClient.from('schools').select('features_enabled').eq('id', oc.school_id).single();
    if (escola?.features_enabled?.ocorrencias !== true) return resposta({ success: true, pushed: 0, motivo: 'módulo desligado' });

    if (Date.now() - new Date(oc.created_at).getTime() > JANELA_MS) {
      return resposta({ success: true, pushed: 0, motivo: 'fora da janela' });
    }

    let enviados = 0;

    if (oc.visivel_familia) {
      const { data: aluno } = await adminClient.from('students').select('family_id, school_id').eq('id', oc.student_id).single();
      if (aluno && aluno.school_id === oc.school_id) {
        const { data: resp } = await adminClient.from('student_guardians').select('guardian_id').eq('student_id', oc.student_id).eq('school_id', oc.school_id);
        const ids = [...new Set([aluno.family_id, ...(resp || []).map((r: { guardian_id: string }) => r.guardian_id)].filter(Boolean))] as string[];
        if (ids.length > 0) {
          const { sent } = await sendPush(adminClient, ids, {
            title: oc.exige_ciencia ? 'Ocorrência aguardando sua ciência' : 'Nova ocorrência do seu filho',
            body: oc.exige_ciencia ? 'Abra o Zela para ler e confirmar a ciência.' : 'Abra o Zela para ler o registro da escola.',
            url: '/',
            tag: 'ocorrencia',
          });
          enviados += sent;
        }
      }
    }

    if (oc.gravidade === 'grave') {
      const { data: equipe } = await adminClient
        .from('users').select('id')
        .eq('school_id', oc.school_id).in('role', ['gestao', 'gestao_pedagogica']).eq('status', 'active');
      const ids = (equipe || []).map((u: { id: string }) => u.id).filter((id: string) => id !== caller.id);
      if (ids.length > 0) {
        const { sent } = await sendPush(adminClient, ids, {
          title: 'Ocorrência grave registrada',
          body: 'Abra Acadêmico › Ocorrências para ver os detalhes.',
          url: '/',
          tag: 'ocorrencia-grave',
        });
        enviados += sent;
      }
    }

    return resposta({ success: true, pushed: enviados });
  } catch (err: any) {
    try {
      await logEdgeError(createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), 'notify-ocorrencia', err.message || String(err));
    } catch (_) { /* melhor esforço */ }
    return resposta({ error: err.message }, 400);
  }
});
