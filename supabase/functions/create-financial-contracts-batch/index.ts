import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { criarClienteAsaas, criarMensalidade, MensalidadeError, CODIGOS_QUE_PULAM } from '../_shared/financialContract.ts';
import { primeiroVencimentoPadrao } from '../_shared/planPricing.ts';

// Mensalidades em lote (04/10/2026). Dois modos:
//   · 'manual': a Gestão marcou alunos na lista "aguardando mensalidade" e
//     confirmou; cada item traz o 1º vencimento e a forma de pagamento.
//   · 'auto': chamada logo depois de aprovar uma matrícula ou rematrícula;
//     só age se a escola ligou a criação automática (nasce desligada), usa o
//     dia de vencimento e a forma de pagamento padrão da escola e PULA, sem
//     alarme, quem ainda não pode ter mensalidade (sem preço, bolsista etc.).
//
// Cada aluno passa pela MESMA regra da criação avulsa
// (_shared/financialContract.ts): preço da tabela de Planos, desconto da
// família, reserva antes de chamar o Asaas.
const LIMITE_POR_CHAMADA = 40;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  let adminClient: ReturnType<typeof createClient> | null = null;
  try {
    adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Sem token de autorização');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) throw new Error('Token inválido ou expirado');

    const { data: callerData, error: dbCallerError } = await adminClient
      .from('users').select('role, school_id').eq('id', caller.id).single();
    if (dbCallerError || !callerData || callerData.role !== 'gestao') {
      throw new Error('Acesso negado: apenas a Gestão pode criar contratos financeiros.');
    }
    const schoolId = callerData.school_id;

    const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
      p_key: `edge:create-financial-contracts-batch:${caller.id}`,
      p_limit: 6,
      p_window_seconds: 300,
    });
    if (rateLimitError) throw rateLimitError;
    if (!rateLimitOk) return json({ error: 'Muitos lotes enviados em pouco tempo. Aguarde alguns minutos.' }, 429);

    const corpo = await req.json();
    const modo = corpo?.mode === 'auto' ? 'auto' : 'manual';
    const itens: Array<Record<string, unknown>> = Array.isArray(corpo?.items) ? corpo.items : [];
    if (itens.length === 0) throw new Error('Informe ao menos um aluno.');
    if (itens.length > LIMITE_POR_CHAMADA) throw new Error(`Envie no máximo ${LIMITE_POR_CHAMADA} alunos por vez.`);

    let padrao: { dia: number; tipo: string } | null = null;
    if (modo === 'auto') {
      const { data: config } = await adminClient
        .from('school_financial_settings')
        .select('auto_create_on_approval, default_due_day, default_billing_type')
        .eq('school_id', schoolId)
        .maybeSingle();
      if (!config?.auto_create_on_approval) {
        return json({ mode: 'auto', desligada: true, resultados: [] });
      }
      padrao = { dia: config.default_due_day, tipo: config.default_billing_type };
    }

    let asaas;
    try {
      asaas = await criarClienteAsaas(adminClient, schoolId, createAsaasClient);
    } catch (err) {
      // Criação automática logo após aprovar matrícula: escola sem conta
      // Asaas não é erro, só não há o que criar ainda.
      if (modo === 'auto' && err instanceof MensalidadeError && err.code === 'sem_gateway') {
        return json({ mode: 'auto', desligada: false, semGateway: true, resultados: [] });
      }
      throw err;
    }
    // Data de hoje em São Paulo (a escola vive nesse fuso), sem hora.
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

    const resultados: Array<Record<string, unknown>> = [];
    for (const item of itens) {
      const student_id = String(item.student_id || '');
      try {
        const criada = await criarMensalidade(adminClient, { schoolId, callerId: caller.id, asaas }, {
          student_id,
          billing_cycle: String(item.billing_cycle || 'MONTHLY'),
          first_due_date: modo === 'auto' && padrao ? primeiroVencimentoPadrao(hoje, padrao.dia) : String(item.first_due_date || ''),
          billing_type: modo === 'auto' && padrao ? padrao.tipo : (item.billing_type ? String(item.billing_type) : undefined),
          description: item.description ? String(item.description) : undefined,
          base_monthly_amount_cents: null, // lote sempre usa a tabela de Planos
          school_year: item.school_year ? Number(item.school_year) : null,
        });
        resultados.push({ student_id, ok: true, contract_id: criada.contract_id, amount_cents: criada.amount_cents });
      } catch (err) {
        const e = err as Error & { code?: string };
        const pula = err instanceof MensalidadeError && (CODIGOS_QUE_PULAM as string[]).includes(e.code || '');
        resultados.push({ student_id, ok: false, pulado: pula, codigo: e.code || 'erro', erro: e.message });
        // Problema da conta Asaas vale para o lote todo: para aqui.
        if (err instanceof MensalidadeError && e.code === 'gateway' && /chave|token|autoriz|unauthorized|access/i.test(e.message)) break;
        if (!pula) await logEdgeError(adminClient, 'create-financial-contracts-batch', e.message || String(e), { student_id, modo }, schoolId, 'warn');
      }
    }
    return json({ mode: modo, desligada: false, resultados });
  } catch (err) {
    if (adminClient && !(err instanceof MensalidadeError && err.code !== 'gateway')) {
      await logEdgeError(adminClient, 'create-financial-contracts-batch', (err as Error).message || String(err), {});
    }
    return json({ error: (err as Error).message }, 400);
  }
});
