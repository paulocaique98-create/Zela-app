import { buildInvoiceAvulsa, type FiscalConfig } from './nfseSettings.ts';

// Agenda a nota de uma cobrança avulsa no Asaas, se a escola ligou o módulo `nfse`, a configuração
// fiscal e a opção das avulsas. Nunca lança: a cobrança não pode depender da nota. Sucesso vira
// uma linha SCHEDULED em financial_invoices (o webhook atualiza depois); falha fica na trilha da
// cobrança (financial_charge_events) com o motivo.

// deno-lint-ignore no-explicit-any
type Cliente = any;

export async function agendarNotaAvulsa(
  adminClient: Cliente,
  asaas: { createInvoice: (body: unknown) => Promise<{ id?: string }> },
  p: { schoolId: string; chargeId: string; paymentId: string; dueDate: string; descricao: string },
): Promise<{ agendada: boolean; motivo?: string }> {
  try {
    const { data: escola } = await adminClient.from('schools').select('features_enabled').eq('id', p.schoolId).maybeSingle();
    if (escola?.features_enabled?.nfse !== true) return { agendada: false, motivo: 'Módulo de nota fiscal desligado.' };

    const { data: config, error } = await adminClient
      .from('school_fiscal_config')
      .select('ativo, municipal_service_id, municipal_service_name, observacoes, iss_percent, retain_iss, pis_percent, cofins_percent, csll_percent, inss_percent, ir_percent, aliquotas_confirmadas_em, emitir_avulsas')
      .eq('school_id', p.schoolId)
      .maybeSingle();
    if (error) throw error;

    const montado = buildInvoiceAvulsa(config as FiscalConfig | null, { paymentId: p.paymentId, dueDate: p.dueDate, descricao: p.descricao });
    if (!montado.ok) return { agendada: false, motivo: montado.motivo };

    const nota = await asaas.createInvoice(montado.body);
    if (nota?.id) {
      await adminClient.from('financial_invoices').upsert({
        school_id: p.schoolId, charge_id: p.chargeId, gateway_invoice_id: nota.id, status: 'SCHEDULED', updated_at: new Date().toISOString(),
      }, { onConflict: 'school_id,gateway_invoice_id' });
    }
    return { agendada: true };
  } catch (err) {
    const motivo = ((err as Error)?.message || 'Falha ao agendar a nota fiscal.').slice(0, 300);
    try {
      await adminClient.from('financial_charge_events').insert({
        charge_id: p.chargeId, event_type: 'nfse_agendamento_falhou', source: 'system', metadata: { motivo },
      });
    } catch { /* o motivo também volta no retorno */ }
    return { agendada: false, motivo };
  }
}
