import { buildInvoiceSettings, type FiscalConfig } from './nfseSettings.ts';

// Liga a emissão automática de nota numa assinatura do Asaas, se a escola tem o módulo `nfse`
// ligado e a configuração fiscal ativa. Nunca lança: a mensalidade não pode depender da nota.
// O resultado fica no contrato (nfse_configurada_em / nfse_erro) para a Gestão acompanhar.

export interface ResultadoNfseContrato {
  configurada: boolean;
  motivo?: string;
}

// deno-lint-ignore no-explicit-any
type Cliente = any;

export async function configurarNotaDoContrato(
  adminClient: Cliente,
  asaas: { setInvoiceSettings: (id: string, body: unknown) => Promise<unknown> },
  schoolId: string,
  contractId: string,
  subscriptionId: string,
): Promise<ResultadoNfseContrato> {
  try {
    const { data: escola } = await adminClient.from('schools').select('features_enabled').eq('id', schoolId).maybeSingle();
    if (escola?.features_enabled?.nfse !== true) return { configurada: false, motivo: 'Módulo de nota fiscal desligado.' };

    const { data: config, error } = await adminClient
      .from('school_fiscal_config')
      .select('ativo, municipal_service_id, municipal_service_name, observacoes, iss_percent, retain_iss, pis_percent, cofins_percent, csll_percent, inss_percent, ir_percent, aliquotas_confirmadas_em')
      .eq('school_id', schoolId)
      .maybeSingle();
    if (error) throw error;

    const montado = buildInvoiceSettings(config as FiscalConfig | null);
    if (!montado.ok) return { configurada: false, motivo: montado.motivo };

    await asaas.setInvoiceSettings(subscriptionId, montado.body);
    await adminClient
      .from('financial_contracts')
      .update({ nfse_configurada_em: new Date().toISOString(), nfse_erro: null })
      .eq('id', contractId)
      .eq('school_id', schoolId);
    return { configurada: true };
  } catch (err) {
    const motivo = ((err as Error)?.message || 'Falha ao configurar a nota fiscal.').slice(0, 300);
    try {
      await adminClient.from('financial_contracts').update({ nfse_erro: motivo }).eq('id', contractId).eq('school_id', schoolId);
    } catch { /* o motivo também volta no retorno */ }
    return { configurada: false, motivo };
  }
}
