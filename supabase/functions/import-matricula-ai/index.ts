import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';

// Importação de Matrícula com IA -- lê uma planilha de formato QUALQUER
// (colunas com nomes livres, sem seguir o "Baixar Modelo" fixo do
// import-matricula-batch) e usa o Gemini pra interpretar/mapear cada linha
// pro formato interno de família (o mesmo shape de src/lib/matriculaFields.js).
//
// Importante: esta function é SÓ LEITURA -- nunca cria conta, nunca grava em
// matricula_solicitacoes nem em nenhuma tabela oficial. Ela só devolve o
// JSON interpretado + um resumo em português por família, pro cliente
// salvar como RASCUNHO (matricula_import_drafts, status='draft'). A
// matrícula oficial só é criada quando o admin revisa o rascunho e clica em
// Enviar (ver send-matricula-draft) -- nenhuma informação vinda da IA vira
// cadastro sem um humano confirmar antes.
const SYSTEM_PROMPT = `Você recebe linhas de uma planilha antiga de matrícula escolar brasileira, em formato livre (os nomes das colunas variam e podem estar abreviados, com erros de digitação ou fora de ordem). Sua tarefa é agrupar as linhas em FAMÍLIAS (uma família = um responsável financeiro, que pode ter mais de um filho em linhas diferentes) e devolver APENAS um JSON válido, sem nenhum texto fora do JSON, no formato:

{
  "families": [
    {
      "cpf_responsavel": "somente dígitos do CPF do responsável financeiro, ou null se não encontrado",
      "responsavel": { "nome": "", "email": "", "cpf": "", "rg": "", "rg_expedicao": "", "rg_orgao": "", "telefone": "", "telefone2": "", "profissao": "", "estado_civil": "" },
      "segundo_responsavel": { "nome": "", "email": "", "cpf": "", "rg": "", "rg_expedicao": "", "rg_orgao": "", "telefone": "", "telefone2": "", "profissao": "", "estado_civil": "" } ou null,
      "criancas": [ { "nome": "", "nascimento": "AAAA-MM-DD ou vazio se não der pra converter", "cidade_nascimento": "", "cep": "", "rua": "", "numero": "", "complemento": "", "bairro": "", "cidade": "", "uf": "", "alimentacao_atual": "", "restricao_alimentar": "", "restricao_saude": "", "especialista": "", "tratamento": "", "alergia": "", "habito_importante": "" } ],
      "autorizados": [ { "nome": "", "telefone": "", "parentesco": "" } ],
      "resumo": "2 a 4 frases em português simples explicando o que foi encontrado nessa família e o que ficou incerto ou faltando (ex: campo vazio na planilha, valor ambíguo, CPF não localizado). Seja honesto sobre incerteza."
    }
  ],
  "resumo_geral": "1 a 2 frases em português simples resumindo a importação inteira (quantas famílias, principais problemas encontrados)."
}

Regras:
- Nunca invente dado que não esteja na planilha. Campo sem informação correspondente fica string vazia "" (ou null pro CPF do responsável se não encontrado) -- não adivinhe.
- "cpf_responsavel" é a chave de vínculo com contas já cadastradas no sistema -- capriche em identificar corretamente qual coluna é o CPF do responsável financeiro (às vezes chamada "CPF", "CPF Resp.", "Documento", etc.).
- Datas: converta para AAAA-MM-DD quando reconhecer o formato original (ex: DD/MM/AAAA); se não conseguir converter com segurança, deixe vazio e mencione no resumo.
- Linhas sem nenhum nome de criança reconhecível devem ser ignoradas (não geram família).
- Uma mesma família pode aparecer em várias linhas (um filho por linha) -- agrupe pelo mesmo responsável (nome + CPF, ou e-mail, o que estiver mais consistente).
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
      throw new Error('Acesso negado: apenas administradores podem importar com IA.');
    }

    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:import-matricula-ai:${caller.id}`,
      p_limit: 5,
      p_window_seconds: 600,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) {
      return new Response(JSON.stringify({ error: 'Muitas importações com IA em pouco tempo. Aguarde alguns minutos.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      });
    }

    const { rows } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Nenhuma linha encontrada no arquivo.');
    }
    if (rows.length > 500) {
      throw new Error('Máximo de 500 linhas por importação com IA. Divida o arquivo em partes menores.');
    }

    // Remove colunas vazias linha a linha antes de mandar pro Gemini --
    // planilhas antigas costumam ter muita coluna em branco, e cada uma
    // delas só engorda o prompt sem carregar informação nenhuma. Prompt
    // menor = resposta mais rápida e menos chance de 503 por sobrecarga.
    const compactRows = rows.map((row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (v !== '' && v !== null && v !== undefined) out[k] = v;
      }
      return out;
    });

    const callGemini = (model: string) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `${SYSTEM_PROMPT}\n\nLinhas da planilha (JSON):\n${JSON.stringify(compactRows)}` },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    // Confirmado com o corpo real da resposta do Google: às vezes é
    // sobrecarga real (503 UNAVAILABLE, "high demand" -- transitório) e às
    // vezes é a cota gratuita da chave (429 RESOURCE_EXHAUSTED, ex: "limit
    // 20 requests/min"). Cada chamada extra de retry/fallback CONSOME dessa
    // mesma cota apertada -- por isso aqui é só 1 retry (não uma cadeia
    // longa de tentativas/modelos), pra não fazer uma única importação
    // sozinha estourar o limite por minuto da chave.
    let geminiRes = await callGemini(geminiModel);
    if (geminiRes.status === 503) {
      await new Promise(r => setTimeout(r, 3000));
      geminiRes = await callGemini(geminiModel);
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('[import-matricula-ai] Erro da API Gemini:', geminiRes.status, errBody);
      const msg = geminiRes.status === 503
        ? 'A IA está com alta demanda no momento. Tente novamente em alguns minutos.'
        : geminiRes.status === 429
        ? 'Limite de uso da IA atingido no momento. Aguarde cerca de 1 minuto e tente de novo.'
        : `Erro ao consultar a IA (status ${geminiRes.status}). Tente novamente.`;
      throw new Error(msg);
    }

    const geminiData = await geminiRes.json();
    const rawContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      console.error('[import-matricula-ai] Resposta inesperada do Gemini:', JSON.stringify(geminiData));
      throw new Error('A IA não retornou nenhum conteúdo.');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error('[import-matricula-ai] Resposta não era JSON válido:', rawContent);
      throw new Error('Não foi possível interpretar a resposta da IA. Tente novamente ou revise a planilha manualmente.');
    }

    if (!Array.isArray(parsed?.families)) {
      throw new Error('A IA não conseguiu identificar nenhuma família reconhecível nessa planilha.');
    }

    return new Response(JSON.stringify({ families: parsed.families, resumo_geral: parsed.resumo_geral || '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await logEdgeError(createClient(supabaseUrl, supabaseServiceKey), 'import-matricula-ai', err.message || String(err));
    } catch (_) { /* melhor esforço */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
