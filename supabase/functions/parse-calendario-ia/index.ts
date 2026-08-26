import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

// Lê o calendário escolar (PDF com layout livre — lista de datas + mini
// calendário gráfico, como o modelo real da escola) usando a API do Google
// Gemini (mesmo padrão de parse-cardapio-ia). Autorização: só admin/
// developer da escola, JWT do caller.
const TIPOS = ['geral', 'feriado', 'reuniao', 'evento', 'passeio'];
const DIAS_SEMANA = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const OCORRENCIAS = ['primeira', 'segunda', 'terceira', 'quarta', 'ultima'];

const SYSTEM_PROMPT = `Você lê PDFs de calendário escolar brasileiro e devolve APENAS um JSON válido, sem nenhum texto fora do JSON, no formato:
{"eventos":[{"date":"AAAA-MM-DD","title":"...","tipo":"geral"}],"aulas_especiais":[{"nome":"...","categoria":"geral","frequencia":"semanal","dias_semana":["Segunda-feira"],"ocorrencias_mes":[]}]}

Sobre "eventos" (coisas com data específica no calendário):
- Use o ano indicado no título/cabeçalho do documento (ex: "CALENDÁRIO 2026" -> ano 2026) pra completar datas que só têm dia/mês.
- "tipo" deve ser um destes 5 valores: ${TIPOS.join(', ')}. Use "feriado" para feriados/pontos facultativos/recessos, "reuniao" para reuniões com pais/equipe, "passeio" para passeios/excursões, "evento" para festas/comemorações pontuais, "geral" pro resto (retorno de aula, formação, etc).
- Se o documento listar um intervalo de dias (ex: "13 a 17 (semana) - Recesso Escolar" ou "13 – 17"), crie UM evento pra CADA dia do intervalo, todos com o mesmo título.
- Se o documento listar datas separadas por vírgula/"e" pro mesmo evento (ex: "16, 17 e 18 - Carnaval"), crie um evento pra cada data.
- Ignore números soltos do mini-calendário gráfico que não tenham uma descrição associada — extraia eventos só a partir da lista de texto com título/descrição.

Sobre "aulas_especiais" (grade recorrente, NUNCA vai em "eventos" — normalmente numa seção separada tipo "AULAS ESPECIAIS", às vezes dividida em "Geral"/"Todos os alunos" e "Integral"):
- "categoria": "geral" se for pra todos os alunos, "integral" se for só pra quem fica no período integral. Se o documento não deixar claro a divisão, use "geral".
- "frequencia": "semanal" se repete toda semana (ex: "toda Segunda-feira", "Terça e Quinta-feira"); "mensal" se repete só em semana(s) específica(s) do mês (ex: "primeira Terça-feira do mês", "primeira e última Quarta-feira do mês").
- "dias_semana": array com um ou mais valores de ${DIAS_SEMANA.join(', ')}.
- "ocorrencias_mes": só preencha quando frequencia="mensal", com um ou mais valores de ${OCORRENCIAS.join(', ')} (ex: "primeira e última" -> ["primeira","ultima"]); deixe [] quando frequencia="semanal".

Regras gerais:
- Nunca invente eventos ou aulas que não estejam no documento. Precisão é mais importante que completude: se algo estiver ilegível ou ambíguo, deixe de fora — um humano revisa antes de qualquer publicação.
- Responda só o JSON, sem markdown, sem \`\`\`.`;

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
      .select('role, school_id')
      .eq('id', caller.id)
      .single();
    if (dbCallerError || !callerData || (callerData.role !== 'admin' && callerData.role !== 'developer')) {
      throw new Error('Acesso negado: apenas administradores podem importar calendário.');
    }

    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:parse-calendario-ia:${caller.id}`,
      p_limit: 10,
      p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas importações em pouco tempo. Aguarde alguns minutos.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      });
    }

    const { pdfBase64 } = await req.json();
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      throw new Error('Nenhum PDF recebido.');
    }
    if (pdfBase64.length > 15_000_000) {
      throw new Error('PDF muito grande. Envie um arquivo menor.');
    }

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
              { text: `${SYSTEM_PROMPT}\n\nLeia o calendário no PDF anexo e devolva o JSON pedido.` },
              { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
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
      console.error('[parse-calendario-ia] Erro da API Gemini:', geminiRes.status, errBody);
      const msg = geminiRes.status === 503
        ? 'A IA está sobrecarregada no momento. Tente novamente em alguns instantes.'
        : `Erro ao consultar a IA (status ${geminiRes.status}). Tente novamente.`;
      throw new Error(msg);
    }

    const geminiData = await geminiRes.json();
    const rawContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      console.error('[parse-calendario-ia] Resposta inesperada do Gemini:', JSON.stringify(geminiData));
      throw new Error('A IA não retornou nenhum conteúdo.');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error('[parse-calendario-ia] Resposta não era JSON válido:', rawContent);
      throw new Error('Não foi possível interpretar a resposta da IA. Tente novamente ou revise manualmente.');
    }

    if (!Array.isArray(parsed?.eventos)) {
      throw new Error('A IA não retornou nenhum evento reconhecível nesse PDF.');
    }

    return new Response(JSON.stringify({
      eventos: parsed.eventos,
      aulas_especiais: Array.isArray(parsed?.aulas_especiais) ? parsed.aulas_especiais : [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
