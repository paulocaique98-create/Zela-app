import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';

// Fase C do PLANO_IA_RESUMO_ERROS.md — explica em português, sob demanda,
// um log de error_logs que o dicionário determinístico
// (src/lib/errorSummaries.js) não reconheceu. Usa o Gemini, mesmo provedor
// já integrado e pago em parse-cardapio-ia/parse-calendario-ia (não Grok --
// não há integração com Grok neste projeto, ver PLANO_IA_RESUMO_ERROS.md).
//
// A IA NUNCA decide nem corrige nada -- só devolve uma frase explicativa,
// que fica marcada no frontend como "palpite da IA", nunca como fato.
const SYSTEM_PROMPT = `Você explica erros técnicos de um sistema de gestão escolar (Zela) para uma pessoa leiga, em português, em até 3 frases curtas.
Regras:
- Foque na causa mais provável e no que ela representa na prática (ex: "provavelmente o usuário perdeu conexão no meio da ação"), não em jargão técnico sem explicar.
- Não sugira correção de código nem passos técnicos de resolução -- só a explicação da causa.
- Se a mensagem/contexto não tiver informação suficiente para uma causa provável, diga isso claramente (ex: "não há informação suficiente pra saber a causa exata") em vez de inventar uma explicação genérica.
- Nunca invente detalhes que não estejam nos dados fornecidos.
- Responda só a explicação em texto simples, sem markdown, sem aspas em volta.`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY não configurada no servidor.');
    const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');

    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single();
    if (dbCallerError || !callerData || callerData.role !== 'developer') {
      throw new Error('Acesso negado: apenas a equipe Zela pode pedir explicação de logs.');
    }

    const { log_id, force } = await req.json();
    if (!log_id) throw new Error('log_id não informado.');

    const { data: log, error: logError } = await adminClient
      .from('error_logs')
      .select('id, source, category, severity, message, stack, context, ai_summary')
      .eq('id', log_id)
      .single();
    if (logError || !log) throw new Error('Log não encontrado.');

    // Cacheado: nunca gera de novo sozinho, só se o front pedir
    // explicitamente "Gerar de novo" (force=true).
    if (log.ai_summary && !force) {
      return new Response(JSON.stringify({ ai_summary: log.ai_summary, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit: chamada de IA tem custo/cota — mesmo padrão de
    // parse-cardapio-ia, escopado por developer.
    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:explain-error-log:${caller.id}`,
      p_limit: 20,
      p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitos pedidos de explicação em pouco tempo. Aguarde alguns minutos.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      });
    }

    // Nunca manda payload bruto/segredo -- só os campos já estruturados e
    // truncados que a própria linha de error_logs guarda (mesma disciplina
    // de logEdgeError.ts).
    const promptData = {
      fonte: log.source,
      categoria: log.category,
      severidade: log.severity,
      mensagem: String(log.message || '').slice(0, 2000),
      stack: log.stack ? String(log.stack).slice(0, 3000) : null,
      contexto: log.context || null,
    };

    const callGemini = () => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `${SYSTEM_PROMPT}\n\nDados do erro (JSON):\n${JSON.stringify(promptData)}` },
            ],
          }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    let geminiRes = await callGemini();
    if (geminiRes.status === 503) {
      await new Promise(r => setTimeout(r, 1500));
      geminiRes = await callGemini();
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('[explain-error-log] Erro da API Gemini:', geminiRes.status, errBody);
      const msg = geminiRes.status === 503
        ? 'A IA está sobrecarregada no momento. Tente novamente em alguns instantes.'
        : `Erro ao consultar a IA (status ${geminiRes.status}). Tente novamente.`;
      throw new Error(msg);
    }

    const geminiData = await geminiRes.json();
    const explanation = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!explanation) {
      console.error('[explain-error-log] Resposta inesperada do Gemini:', JSON.stringify(geminiData));
      throw new Error('A IA não retornou nenhuma explicação.');
    }

    const { error: updateError } = await adminClient
      .from('error_logs')
      .update({
        ai_summary: explanation,
        ai_summary_model: geminiModel,
        ai_summary_generated_at: new Date().toISOString(),
        ai_summary_generated_by: caller.id,
      })
      .eq('id', log_id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ai_summary: explanation, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'explain-error-log', err.message || String(err));
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
