import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createAsaasClient } from '../_shared/asaas.ts';
import { logEdgeError } from '../_shared/logEdgeError.ts';
import { criarClienteAsaas } from '../_shared/financialContract.ts';
import { aplicarPercentual, calcularValorDoCiclo, planoDoAluno, procurarPreco } from '../_shared/planPricing.ts';
import type { PeriodicidadeDeCobranca } from '../_shared/planPricing.ts';

// Reajuste de mensalidades ativas (04/10/2026). Só a Gestão.
//   · mode 'table': cada contrato passa a usar o preço da tabela de Planos do
//     ano informado (ciclo e turno do aluno);
//   · mode 'percent': o mensal base de cada contrato sobe (ou desce) por um
//     percentual.
// O desconto da família que já estava aplicado no contrato é mantido. Vale
// para as cobranças que o Asaas gerar daqui para frente; as já emitidas
// ficam como estão (para uma delas, use "Ajustar valor" na cobrança).
// dry_run devolve só a prévia, sem mudar nada.
const LIMITE = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      throw new Error('Acesso negado: apenas a Gestão pode reajustar mensalidades.');
    }
    const schoolId = callerData.school_id;

    const corpo = await req.json();
    const modo = corpo?.mode;
    const dryRun = corpo?.dry_run !== false; // sem pedir de propósito, só mostra a prévia
    if (modo !== 'table' && modo !== 'percent') throw new Error('Escolha reajustar pela tabela de Planos ou por percentual.');
    const percentual = Number(corpo?.percent);
    if (modo === 'percent' && (!Number.isFinite(percentual) || percentual <= -100 || percentual > 300)) {
      throw new Error('Informe um percentual válido (entre menos 99 e 300).');
    }
    const ano = Number(corpo?.school_year);
    if (modo === 'table' && (!Number.isInteger(ano) || ano < 2000 || ano > 2100)) throw new Error('Informe o ano da tabela de Planos.');
    const ids: string[] | null = Array.isArray(corpo?.contract_ids) ? corpo.contract_ids.map(String) : null;
    if (ids && (ids.length === 0 || ids.some(i => !UUID.test(i)))) throw new Error('Lista de contratos inválida.');
    if (ids && ids.length > LIMITE) throw new Error(`Reajuste no máximo ${LIMITE} contratos por vez.`);

    if (!dryRun) {
      const { data: rateLimitOk, error: rateLimitError } = await adminClient.rpc('check_rate_limit', {
        p_key: `edge:readjust-contracts:${caller.id}`,
        p_limit: 6,
        p_window_seconds: 300,
      });
      if (rateLimitError) throw rateLimitError;
      if (!rateLimitOk) return json({ error: 'Muitos reajustes em pouco tempo. Aguarde alguns minutos.' }, 429);
    }

    let consulta = adminClient
      .from('financial_contracts')
      .select('id, student_id, billing_cycle, base_monthly_amount_cents, discount_percent_applied, amount_cents, gateway_subscription_id, students:student_id(name, contracted_hours, turno)')
      .eq('school_id', schoolId)
      .eq('status', 'active');
    if (ids) consulta = consulta.in('id', ids);
    const { data: contratos, error: contratosError } = await consulta.limit(LIMITE + 1);
    if (contratosError) throw contratosError;
    if ((contratos || []).length > LIMITE) throw new Error(`Há mais de ${LIMITE} contratos ativos: escolha quais reajustar.`);

    let precos: Array<{ school_year: number; ciclo_horas: number; turno: string; monthly_amount_cents: number }> = [];
    if (modo === 'table') {
      const { data, error } = await adminClient
        .from('school_plan_prices')
        .select('school_year, ciclo_horas, turno, monthly_amount_cents')
        .eq('school_id', schoolId)
        .eq('school_year', ano);
      if (error) throw error;
      precos = data || [];
    }

    // Prévia: o que muda em cada contrato.
    const linhas = (contratos || []).map((c) => {
      const aluno = Array.isArray(c.students) ? c.students[0] : c.students;
      const base = {
        contract_id: c.id as string,
        student_name: (aluno?.name as string) || '',
        billing_cycle: c.billing_cycle as string,
        from_base_cents: c.base_monthly_amount_cents as number,
        from_amount_cents: c.amount_cents as number,
      };
      if (!c.gateway_subscription_id) return { ...base, acao: 'pular', motivo: 'Sem assinatura no Asaas.' };
      let novoBase: number;
      if (modo === 'table') {
        const plano = planoDoAluno(aluno);
        const preco = procurarPreco(precos, ano, plano.ciclo, plano.turno);
        if (preco === null) return { ...base, acao: 'pular', motivo: 'Sem preço na tabela para o ciclo e turno deste aluno.' };
        novoBase = preco;
      } else {
        novoBase = aplicarPercentual(c.base_monthly_amount_cents, percentual);
      }
      const novoValor = calcularValorDoCiclo(novoBase, c.billing_cycle as PeriodicidadeDeCobranca, Number(c.discount_percent_applied) || 0);
      if (novoBase === c.base_monthly_amount_cents && novoValor === c.amount_cents) return { ...base, acao: 'pular', motivo: 'O valor já é esse.' };
      return { ...base, acao: 'reajustar', to_base_cents: novoBase, to_amount_cents: novoValor, _subscription: c.gateway_subscription_id as string };
    });

    const publica = (l: Record<string, unknown>) => { const { _subscription, ...resto } = l; void _subscription; return resto; };
    if (dryRun) return json({ dry_run: true, linhas: linhas.map(publica) });

    const asaas = await criarClienteAsaas(adminClient, schoolId, createAsaasClient);
    const resultados: Array<Record<string, unknown>> = [];
    for (const l of linhas) {
      if (l.acao !== 'reajustar') { resultados.push({ ...publica(l), ok: false, pulado: true }); continue; }
      try {
        // Asaas primeiro; o Zela só muda depois que o Asaas aceitou.
        // deno-lint-ignore no-explicit-any
        await (asaas as any).updateSubscription(l._subscription, { value: (l.to_amount_cents as number) / 100, updatePendingPayments: false });
        const { error: updateError } = await adminClient
          .from('financial_contracts')
          .update({
            base_monthly_amount_cents: l.to_base_cents,
            amount_cents: l.to_amount_cents,
            price_source: modo === 'table' ? 'tabela' : 'manual',
            ...(modo === 'table' ? { school_year: ano } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', l.contract_id);
        if (updateError) throw updateError;
        await adminClient.from('audit_logs').insert({
          school_id: schoolId,
          actor_id: caller.id,
          action: 'readjust_contract',
          entity_type: 'financial_contract',
          entity_id: l.contract_id,
          details: { mode: modo, percent: modo === 'percent' ? percentual : null, school_year: modo === 'table' ? ano : null, from_cents: l.from_amount_cents, to_cents: l.to_amount_cents },
        });
        resultados.push({ ...publica(l), ok: true });
      } catch (err) {
        resultados.push({ ...publica(l), ok: false, erro: (err as Error).message });
        await logEdgeError(adminClient, 'readjust-contracts', (err as Error).message || String(err), { contract_id: l.contract_id }, schoolId, 'warn');
      }
    }
    return json({ dry_run: false, resultados });
  } catch (err) {
    if (adminClient) await logEdgeError(adminClient, 'readjust-contracts', (err as Error).message || String(err), {}, null, 'warn');
    return json({ error: (err as Error).message }, 400);
  }
});
