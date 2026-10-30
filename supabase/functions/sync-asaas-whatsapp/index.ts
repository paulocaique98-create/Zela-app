import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { sincronizarEscola } from '../_shared/asaasWhatsapp.ts';

// WhatsApp pelas notificações nativas do Asaas (régua de cobrança, D12 opção a).
//  Gestão:  acao 'estado' | 'ativar' | 'desativar' | 'sincronizar'
//  Família: acao 'estado' | 'minha_preferencia' (aplica a própria escolha, já gravada em billing_channel_prefs)
// Exige o módulo regua_cobranca ligado. O custo de cada mensagem é do Asaas, na conta da escola.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sem token de autorização' }, 401);
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return json({ error: 'Token inválido ou expirado' }, 401);

    const { data: eu } = await admin.from('users').select('role, school_id').eq('id', user.id).single();
    if (!eu) return json({ error: 'Usuário não encontrado' }, 403);
    const { data: escola } = await admin.from('schools').select('features_enabled').eq('id', eu.school_id).single();
    if (escola?.features_enabled?.regua_cobranca !== true) return json({ error: 'A régua de cobrança não está ligada nesta escola.' }, 403);

    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo?.acao || '');
    const { data: regra } = await admin.from('billing_rules').select('whatsapp_asaas').eq('school_id', eu.school_id).maybeSingle();
    const ligado = regra?.whatsapp_asaas === true;

    if (acao === 'estado') {
      if (eu.role === 'gestao') {
        const { data: linhas } = await admin.from('asaas_whatsapp_sync').select('aplicado, erro').eq('school_id', eu.school_id).limit(5000);
        const l = linhas || [];
        return json({
          ligado,
          aplicados: l.filter((x) => x.aplicado).length,
          com_erro: l.filter((x) => x.erro).length,
        });
      }
      return json({ ligado });
    }

    if (eu.role === 'gestao') {
      if (acao === 'ativar' || acao === 'desativar') {
        const { error } = await admin.from('billing_rules').upsert(
          { school_id: eu.school_id, whatsapp_asaas: acao === 'ativar', updated_by: user.id },
          { onConflict: 'school_id' },
        );
        if (error) throw error;
      } else if (acao !== 'sincronizar') {
        return json({ error: 'Ação inválida.' }, 400);
      }
      const r = await sincronizarEscola(admin, eu.school_id, { limite: 40 });
      return json({ success: true, ligado: acao === 'ativar' ? true : acao === 'desativar' ? false : ligado, ...r });
    }

    if (eu.role === 'family' && acao === 'minha_preferencia') {
      if (!ligado) return json({ success: true, aplicados: 0, falhas: 0, pendentes: 0 });
      const r = await sincronizarEscola(admin, eu.school_id, { familyId: user.id, limite: 10 });
      return json({ success: true, ...r });
    }

    return json({ error: 'Acesso negado.' }, 403);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try { await logEdgeError(admin, 'sync-asaas-whatsapp', msg); } catch (_) { /* melhor esforço */ }
    return json({ error: msg }, 500);
  }
});
