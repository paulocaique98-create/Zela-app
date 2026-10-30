import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { sendPush } from '../_shared/push.ts';
import { sendEmail } from '../_shared/resend.ts';
import { dataBR, modeloPadrao, preencher, somaDias, textoParaHtml, agoraBrasilia } from '../_shared/billingRules.ts';

// Envio de teste da régua de cobrança (item 14): manda o modelo preenchido com dados de exemplo
// só para o próprio usuário da Gestão que pediu. Nunca para a família.
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  try {
    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sem token de autorização' }, 401);
    const { data: { user }, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !user) return json({ error: 'Token inválido ou expirado' }, 401);

    const { data: eu } = await adminClient.from('users').select('role, school_id, name, email').eq('id', user.id).single();
    if (!eu || eu.role !== 'gestao') return json({ error: 'Acesso negado: apenas a Gestão.' }, 403);
    const { data: escola } = await adminClient.from('schools').select('features_enabled').eq('id', eu.school_id).single();
    if (escola?.features_enabled?.regua_cobranca !== true) return json({ error: 'A régua de cobrança não está ligada nesta escola.' }, 403);

    const corpo = await req.json();
    const canal = corpo?.canal === 'push' ? 'push' : corpo?.canal === 'email' ? 'email' : null;
    const dias = Number(corpo?.dias);
    if (!canal || !Number.isInteger(dias) || dias < -30 || dias > 60) return json({ error: 'Canal ou dia inválido.' }, 400);
    const textoModelo = typeof corpo?.texto === 'string' ? corpo.texto.slice(0, 800) : '';
    const assuntoModelo = typeof corpo?.assunto === 'string' ? corpo.assunto.slice(0, 120) : '';
    const padrao = modeloPadrao(canal, dias);

    const vars = {
      responsavel: (eu.name || 'responsável').split(' ')[0],
      aluno: 'Aluno Exemplo',
      valor: 'R$ 850,00',
      vencimento: dataBR(somaDias(agoraBrasilia().data, -dias)),
      link_pagamento: 'https://zelaedu.com.br/exemplo',
    };
    const texto = preencher(textoModelo.trim() || padrao.texto, vars);
    const assunto = `[Teste] ${preencher(assuntoModelo.trim() || padrao.assunto, vars)}`;

    let entregue = false;
    let aviso = '';
    if (canal === 'push') {
      const r = await sendPush(adminClient, [user.id], { title: assunto, body: texto, url: '/', tag: 'regua-teste' });
      entregue = r.sent > 0;
      if (!entregue) aviso = 'Seu aparelho não tem notificação ativada neste navegador.';
    } else {
      if (!eu.email) return json({ error: 'Seu usuário não tem e-mail cadastrado.' }, 400);
      const r = await sendEmail({ to: eu.email, subject: assunto, html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${textoParaHtml(texto)}</div>` });
      entregue = r.ok;
      if (!r.ok) aviso = r.error || 'Falha no envio do e-mail.';
    }

    return json({ success: entregue, aviso });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
