import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

// Lê um cardápio em formato de tabela livre (sem data de calendário no
// texto — só dia da semana × refeição, como o documento real da
// nutricionista) usando a API do Google Gemini (tier gratuito, lê o PDF
// diretamente — sem precisar converter em imagem no cliente). Autorização
// pelo mesmo padrão das outras Edge Functions: só admin/developer da
// escola, JWT do caller.
const REFEICOES = ['Desjejum', 'Almoço', 'Lanche', 'Jantar'];
const DIAS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const SYSTEM_PROMPT = `Você lê PDFs de cardápios escolares brasileiros e devolve APENAS um JSON válido, sem nenhum texto fora do JSON, no formato:
{"cardapios":[{"numero":1,"dias":{"Segunda-feira":{"Desjejum":"...","Almoço":"...","Lanche":"...","Jantar":"..."},"Terça-feira":{...}}}]}

Regras:
- "numero" é o número do cardápio conforme escrito no documento (ex: "CARDÁPIO 1" -> numero 1). Se não houver numeração, use 1.
- Chaves de dia da semana permitidas: ${DIAS.join(', ')}. Só inclua os dias que aparecerem na tabela.
- Chaves de refeição permitidas: ${REFEICOES.join(', ')}. Mapeie sinônimos: "café da manhã"->Desjejum, "colação"->Lanche, "ceia"->Jantar.
- Cada valor de refeição é UMA STRING com os pratos separados por vírgula, tudo em uma linha (junte várias linhas/itens da célula original nessa única string).
- Se uma refeição não existir pra um dia, não inclua a chave.
- Nunca invente pratos que não estejam no documento. Precisão é mais importante que completude: se um trecho estiver ilegível ou ambíguo, é melhor deixar de fora do que adivinhar — um humano revisa e completa manualmente antes de qualquer publicação.
- Transcreva os nomes dos pratos exatamente como escritos (só corrija espaçamento óbvio de quebra de linha), sem resumir ou reescrever.
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
      throw new Error('Acesso negado: apenas administradores podem importar cardápio.');
    }

    // Rate limit: chamada de IA tem custo/cota — limite baixo por caller.
    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:parse-cardapio-ia:${caller.id}`,
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
    // ~15MB em base64 (o limite real do Gemini pra inline_data é 20MB) —
    // suficiente pra qualquer cardápio mensal digitalizado como texto real.
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
              { text: `${SYSTEM_PROMPT}\n\nLeia o cardápio no PDF anexo e devolva o JSON pedido.` },
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

    // 503 = modelo sobrecarregado no lado do Gemini, transitório — vale a
    // pena tentar de novo antes de desistir (evita mandar o admin refazer
    // upload por causa de um pico passageiro de demanda do Google).
    let geminiRes = await callGemini();
    if (geminiRes.status === 503) {
      await new Promise(r => setTimeout(r, 1500));
      geminiRes = await callGemini();
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('[parse-cardapio-ia] Erro da API Gemini:', geminiRes.status, errBody);
      const msg = geminiRes.status === 503
        ? 'A IA está sobrecarregada no momento. Tente novamente em alguns instantes.'
        : `Erro ao consultar a IA (status ${geminiRes.status}). Tente novamente.`;
      throw new Error(msg);
    }

    const geminiData = await geminiRes.json();
    const rawContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      console.error('[parse-cardapio-ia] Resposta inesperada do Gemini:', JSON.stringify(geminiData));
      throw new Error('A IA não retornou nenhum conteúdo.');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error('[parse-cardapio-ia] Resposta não era JSON válido:', rawContent);
      throw new Error('Não foi possível interpretar a resposta da IA. Tente novamente ou revise manualmente.');
    }

    if (!Array.isArray(parsed?.cardapios)) {
      throw new Error('A IA não retornou nenhum cardápio reconhecível nesse PDF.');
    }

    return new Response(JSON.stringify({ cardapios: parsed.cardapios }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
