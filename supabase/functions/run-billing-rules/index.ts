import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { sendPush } from '../_shared/push.ts';
import { sendEmail } from '../_shared/resend.ts';
import { centsToBRL } from '../_shared/sendFamilyNotification.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import {
  agoraBrasilia, dataBR, escaparHtml, modeloPadrao, passosValidos, preencher, somaDias, textoParaHtml,
} from '../_shared/billingRules.ts';
import type { CanalRegua } from '../_shared/billingRules.ts';

// Régua de cobrança (item 14). Roda de hora em hora pelo pg_cron. Para cada escola com o módulo
// e a régua ligados, dentro do horário permitido, manda push e e-mail nos dias de cada passo
// (negativo = antes do vencimento). Nunca manda duas vezes: billing_dispatches tem chave única
// (charge_id, dias, canal). Pula cobrança paga, cancelada, em acordo ativo (item 10) e família que
// desligou o canal. O status é conferido de novo na hora de enviar.
//
// Autenticação: mesmo padrão do send-financial-reminders (o gateway já barra JWT inválido; aqui
// só se confere que o papel do token é service_role).
function isServiceRoleToken(authHeader: string | null): boolean {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

const ABERTAS = ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE'];
const MAX_TENTATIVAS = 3;
const LIMITE_POR_PASSO = 1000;

serve(async (req) => {
  if (!isServiceRoleToken(req.headers.get('Authorization'))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const resumo = { escolas: 0, enviados: 0, falhas: 0, ignorados: 0 };

  try {
    const { data: regras, error: regrasErr } = await adminClient
      .from('billing_rules').select('school_id, passos, hora_inicio, hora_fim').eq('ativa', true);
    if (regrasErr) throw regrasErr;

    const agora = agoraBrasilia();
    const ids = (regras || []).map((r) => r.school_id);
    const { data: escolas } = ids.length
      ? await adminClient.from('schools').select('id, features_enabled').in('id', ids)
      : { data: [] as Array<{ id: string; features_enabled: Record<string, unknown> | null }> };
    const comModulo = new Set((escolas || []).filter((e) => e.features_enabled?.regua_cobranca === true).map((e) => e.id));

    for (const regra of regras || []) {
      if (!comModulo.has(regra.school_id)) continue;
      if (agora.hora < regra.hora_inicio || agora.hora >= regra.hora_fim) continue;
      const passos = passosValidos(regra.passos);
      if (!passos.length) continue;
      resumo.escolas++;

      const { data: modelosRows } = await adminClient
        .from('billing_message_templates').select('canal, dias, assunto, texto').eq('school_id', regra.school_id);
      const modelos = new Map((modelosRows || []).map((m) => [`${m.canal}:${m.dias}`, m]));

      for (const passo of passos) {
        const vencimento = somaDias(agora.data, -passo.dias);
        const { data: cobrancas, error: cobErr } = await adminClient
          .from('financial_charges')
          .select('id, family_id, student_id, due_date, amount_cents, payment_link, boleto_url, students:student_id(name)')
          .eq('school_id', regra.school_id)
          .eq('due_date', vencimento)
          .in('status', ABERTAS)
          .limit(LIMITE_POR_PASSO);
        if (cobErr) throw cobErr;
        if (!cobrancas?.length) continue;

        const chargeIds = cobrancas.map((c) => c.id);
        const familyIds = Array.from(new Set(cobrancas.map((c) => c.family_id)));

        const [acordos, envios, prefs, usuarios] = await Promise.all([
          adminClient.from('debt_agreement_charges').select('charge_id').in('charge_id', chargeIds).eq('ativa', true),
          adminClient.from('billing_dispatches').select('charge_id, canal, status, tentativas').in('charge_id', chargeIds).eq('dias', passo.dias),
          adminClient.from('billing_channel_prefs').select('user_id, canal').in('user_id', familyIds).eq('optou_sair', true),
          adminClient.from('users').select('id, name, email').in('id', familyIds),
        ]);
        const emAcordo = new Set((acordos.data || []).map((a) => a.charge_id));
        const feitos = new Map((envios.data || []).map((e) => [`${e.charge_id}:${e.canal}`, e]));
        const semCanal = new Set((prefs.data || []).map((p) => `${p.user_id}:${p.canal}`));
        const pessoas = new Map((usuarios.data || []).map((u) => [u.id, u]));

        // deno-lint-ignore no-explicit-any
        for (const c of cobrancas as any[]) {
          if (emAcordo.has(c.id)) continue;
          const pessoa = pessoas.get(c.family_id);
          for (const canal of passo.canais) {
            const anterior = feitos.get(`${c.id}:${canal}`);
            if (anterior && (anterior.status !== 'falhou' || anterior.tentativas >= MAX_TENTATIVAS)) continue;

            let status: 'enviado' | 'falhou' | 'ignorado' = 'enviado';
            let erro: string | null = null;
            try {
              if (semCanal.has(`${c.family_id}:${canal}`)) {
                status = 'ignorado'; erro = 'Responsável desligou este canal';
              } else {
                // Confere o status no momento do envio (pagamento pode ter entrado há segundos).
                const { data: atual } = await adminClient
                  .from('financial_charges').select('status').eq('id', c.id).maybeSingle();
                if (!atual || !ABERTAS.includes(atual.status)) continue;

                const modelo = modelos.get(`${canal}:${passo.dias}`) || modeloPadrao(canal as CanalRegua, passo.dias);
                const vars = {
                  responsavel: (pessoa?.name || 'responsável').split(' ')[0],
                  aluno: c.students?.name || 'seu filho(a)',
                  valor: centsToBRL(c.amount_cents),
                  vencimento: dataBR(c.due_date),
                  link_pagamento: c.payment_link || c.boleto_url || '',
                };
                const texto = preencher(modelo.texto, vars).replace(/\s+Para pagar:\s*$/, '');
                const assunto = preencher(modelo.assunto || modeloPadrao(canal as CanalRegua, passo.dias).assunto, vars);

                if (canal === 'push') {
                  await adminClient.from('notifications').insert({
                    school_id: regra.school_id, family_id: c.family_id, student_id: c.student_id,
                    type: 'financeiro', message: texto, url: null,
                  });
                  const r = await sendPush(adminClient, [c.family_id], { title: assunto, body: texto, url: '/', tag: `regua-${c.id}-${passo.dias}` });
                  if (r.sent === 0 && r.failed > 0) { status = 'falhou'; erro = (r.errors[0] || 'Push não entregue').slice(0, 500); }
                } else if (!pessoa?.email) {
                  status = 'ignorado'; erro = 'Responsável sem e-mail';
                } else {
                  const r = await sendEmail({
                    to: pessoa.email,
                    subject: assunto,
                    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${textoParaHtml(texto)}<br><br><small style="color:#666">${escaparHtml('Mensagem automática da cobrança escolar. Para deixar de receber por e-mail, ajuste em Configurações no Zela.')}</small></div>`,
                  });
                  if (!r.ok) { status = 'falhou'; erro = (r.error || 'Falha no envio').slice(0, 500); }
                }
              }
            } catch (e) {
              status = 'falhou'; erro = (e instanceof Error ? e.message : String(e)).slice(0, 500);
            }

            await adminClient.from('billing_dispatches').upsert({
              school_id: regra.school_id, charge_id: c.id, dias: passo.dias, canal, status, erro,
              tentativas: (anterior?.tentativas || 0) + 1, enviado_em: new Date().toISOString(),
            }, { onConflict: 'charge_id,dias,canal' });
            if (status === 'enviado') resumo.enviados++;
            else if (status === 'falhou') resumo.falhas++;
            else resumo.ignorados++;
          }
        }
      }
    }

    try {
      await adminClient.rpc('log_cron_job_run', {
        p_job_name: 'run-billing-rules-job', p_status_code: 200,
        p_detail: `escolas:${resumo.escolas},enviados:${resumo.enviados},falhas:${resumo.falhas},ignorados:${resumo.ignorados}`,
      });
    } catch (_) { /* observabilidade não derruba o job */ }

    return new Response(JSON.stringify({ success: true, ...resumo }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await logEdgeError(adminClient, 'run-billing-rules', msg);
      await adminClient.rpc('log_cron_job_run', { p_job_name: 'run-billing-rules-job', p_status_code: 500, p_detail: msg.slice(0, 500) });
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
