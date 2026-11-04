// Ajustes na ficha do contrato (PLANO_FATURAMENTO_ZELA.md, seção 7B, item 9B): sincronização com o Asaas.
// O banco é gravado primeiro pelas RPCs (zela_ajustar_vencimentos, zela_reparcelar_saldo,
// zela_aplicar_desconto_mensalidade), que validam role, estado e motivo. Aqui o Asaas é alinhado ao banco.
// Se o Asaas falhar, o ajuste fica com sincronizado_asaas = false e erro_asaas; "sincronizar_ajuste" tenta de novo
// (idempotente: reenvia o valor e o vencimento atuais do banco, e só cria no Asaas o que ainda não tem pagamento).

import { logEdgeError } from './logEdgeError.ts';
import { montarPagamentoAsaas } from './zelaBilling.ts';

// deno-lint-ignore no-explicit-any
type Cliente = any;

const ABERTAS = ['pendente', 'vencida'];

// Cria no Asaas as cobranças pendentes ainda sem pagamento (as do reparcelamento). Nunca duplica.
export async function criarPendentesNoAsaas(adminClient: Cliente, asaas: Cliente, contratacaoId: string) {
  const { data: ct } = await adminClient.from('school_contratacoes').select('id, school_id').eq('id', contratacaoId).single();
  if (!ct) throw new Error('Contratação não encontrada.');
  const { data: cobrancas, error } = await adminClient.from('zela_cobrancas')
    .select('id, tipo, numero, vencimento, valor, status, asaas_payment_id, asaas_customer_id')
    .eq('contratacao_id', ct.id).order('numero');
  if (error) throw error;
  const pendentes = (cobrancas || []).filter((c: Cliente) => c.status === 'pendente' && !c.asaas_payment_id);
  const criadas: Array<{ id: string; invoice_url: string | null }> = [];
  const falhas: Array<{ id: string; erro: string }> = [];
  if (pendentes.length === 0) return { criadas, falhas };

  const { data: cfg } = await adminClient.from('zela_config_comercial').select('multa_percent, juros_mensal_percent').eq('id', true).single();
  if (!cfg) throw new Error('Configuração comercial do Zela não encontrada.');

  let customerId = (cobrancas || []).find((c: Cliente) => c.asaas_customer_id)?.asaas_customer_id as string | undefined;
  if (!customerId) {
    const { data: outras } = await adminClient.from('zela_cobrancas')
      .select('asaas_customer_id').eq('school_id', ct.school_id).not('asaas_customer_id', 'is', null).limit(1);
    customerId = outras?.[0]?.asaas_customer_id;
  }
  if (!customerId) throw new Error('A escola ainda não tem cliente no Asaas. Use "Gerar cobranças" no Faturamento.');

  const parcelas = (cobrancas || []).filter((c: Cliente) => c.tipo === 'parcela');
  const total = Math.max(parcelas.length, ...parcelas.map((p: Cliente) => Number(p.numero)));
  for (const c of pendentes) {
    try {
      const pagamento = await asaas.createPayment(montarPagamentoAsaas(c, customerId, cfg, total));
      const invoiceUrl = pagamento.invoiceUrl ?? pagamento.bankSlipUrl ?? null;
      const { error: upErr } = await adminClient.from('zela_cobrancas')
        .update({ asaas_customer_id: customerId, asaas_payment_id: pagamento.id, invoice_url: invoiceUrl })
        .eq('id', c.id).is('asaas_payment_id', null);
      if (upErr) {
        await asaas.cancelPayment(pagamento.id).catch(() => {});
        throw upErr;
      }
      criadas.push({ id: c.id, invoice_url: invoiceUrl });
    } catch (e) {
      const erro = (e as Error)?.message || String(e);
      falhas.push({ id: c.id, erro });
      await logEdgeError(adminClient, 'create-zela-charge', erro, { cobranca_id: c.id }, ct.school_id);
    }
  }
  return { criadas, falhas };
}

// Alinha o Asaas ao banco para um ajuste e registra o resultado no próprio ajuste.
export async function sincronizarAjuste(adminClient: Cliente, asaas: Cliente, ajusteId: string) {
  const { data: aj } = await adminClient.from('zela_cobranca_ajustes')
    .select('id, school_id, contratacao_id, tipo, depois').eq('id', ajusteId).maybeSingle();
  if (!aj) throw new Error('Ajuste não encontrado.');

  const falhas: Array<{ id: string; erro: string }> = [];
  if (aj.tipo === 'reparcelamento') {
    const r = await criarPendentesNoAsaas(adminClient, asaas, aj.contratacao_id);
    falhas.push(...r.falhas);
  } else {
    const ids = (aj.depois as Array<{ id: string }>).map(d => d.id);
    const { data: cobrancas } = await adminClient.from('zela_cobrancas')
      .select('id, status, vencimento, valor, asaas_payment_id').in('id', ids).eq('contratacao_id', aj.contratacao_id);
    for (const c of cobrancas || []) {
      if (!ABERTAS.includes(c.status) || !c.asaas_payment_id) continue;
      try {
        const campos = aj.tipo === 'vencimentos'
          ? { dueDate: c.vencimento as string }
          : { value: Number(c.valor), dueDate: c.vencimento as string };
        await asaas.updatePayment(c.asaas_payment_id, campos);
      } catch (e) {
        const erro = (e as Error)?.message || String(e);
        falhas.push({ id: c.id, erro });
        await logEdgeError(adminClient, 'create-zela-charge', `Ajuste não sincronizado: ${erro}`, { cobranca_id: c.id, ajuste_id: aj.id }, aj.school_id);
      }
    }
  }

  await adminClient.from('zela_cobranca_ajustes').update(falhas.length === 0
    ? { sincronizado_asaas: true, sincronizado_em: new Date().toISOString(), erro_asaas: null }
    : { sincronizado_asaas: false, erro_asaas: String(falhas[0].erro).slice(0, 500) }).eq('id', aj.id);
  return { falhas };
}
