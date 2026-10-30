// Monta o corpo de POST /v3/subscriptions/{id}/invoiceSettings a partir da configuração fiscal
// da escola (school_fiscal_config). Função pura: não chama rede nem banco. Não existe alíquota
// padrão; se faltar dado fiscal, devolve erro em vez de chutar valor.

export interface FiscalConfig {
  ativo: boolean;
  municipal_service_id: string | null;
  municipal_service_name: string | null;
  observacoes: string | null;
  iss_percent: number | null;
  retain_iss: boolean;
  pis_percent: number;
  cofins_percent: number;
  csll_percent: number;
  inss_percent: number;
  ir_percent: number;
  aliquotas_confirmadas_em: string | null;
  emitir_avulsas?: boolean;
}

export interface InvoiceSettingsBody {
  municipalServiceId: string;
  municipalServiceName: string;
  updatePayment: boolean;
  effectiveDatePeriod: 'ON_PAYMENT_CONFIRMATION';
  observations: string;
  deductions: number;
  taxes: {
    retainIss: boolean;
    iss: number;
    pis: number;
    cofins: number;
    csll: number;
    inss: number;
    ir: number;
  };
}

export type InvoiceSettingsResult =
  | { ok: true; body: InvoiceSettingsBody }
  | { ok: false; motivo: string };

const OBSERVACAO_PADRAO = 'Mensalidade escolar';

function aliquotaValida(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
}

export function buildInvoiceSettings(config: FiscalConfig | null | undefined): InvoiceSettingsResult {
  if (!config || !config.ativo) return { ok: false, motivo: 'Nota fiscal não está ativa para esta escola.' };
  const servicoId = config.municipal_service_id?.trim();
  const servicoNome = config.municipal_service_name?.trim();
  if (!servicoId || !servicoNome) return { ok: false, motivo: 'Código ou nome do serviço não informado.' };
  if (!config.aliquotas_confirmadas_em) return { ok: false, motivo: 'Alíquotas ainda não confirmadas.' };
  const aliquotas = [config.iss_percent, config.pis_percent, config.cofins_percent, config.csll_percent, config.inss_percent, config.ir_percent];
  if (!aliquotas.every(aliquotaValida)) return { ok: false, motivo: 'Alíquota ausente ou fora de 0 a 100.' };

  return {
    ok: true,
    body: {
      municipalServiceId: servicoId,
      municipalServiceName: servicoNome,
      updatePayment: true,
      // Nota só depois da confirmação do pagamento; vale para mensal, trimestral, semestral e anual.
      effectiveDatePeriod: 'ON_PAYMENT_CONFIRMATION',
      observations: config.observacoes?.trim() || OBSERVACAO_PADRAO,
      deductions: 0,
      taxes: {
        retainIss: config.retain_iss === true,
        iss: config.iss_percent as number,
        pis: config.pis_percent,
        cofins: config.cofins_percent,
        csll: config.csll_percent,
        inss: config.inss_percent,
        ir: config.ir_percent,
      },
    },
  };
}

export type InvoiceAvulsaResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; motivo: string };

// Corpo de POST /v3/invoices (nota de um pagamento avulso). A data de emissão é literal; usamos o
// vencimento. Só monta se a escola ligou a nota das avulsas.
export function buildInvoiceAvulsa(
  config: FiscalConfig | null | undefined,
  entrada: { paymentId: string; dueDate: string; descricao: string },
): InvoiceAvulsaResult {
  if (!config?.emitir_avulsas) return { ok: false, motivo: 'Nota das cobranças avulsas está desligada.' };
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(entrada.dueDate)) return { ok: false, motivo: 'Data de vencimento inválida.' };
  const base = buildInvoiceSettings(config);
  if (!base.ok) return base;
  const { municipalServiceId, municipalServiceName, observations, deductions, taxes } = base.body;
  return {
    ok: true,
    body: {
      payment: entrada.paymentId,
      serviceDescription: entrada.descricao.slice(0, 500),
      observations,
      municipalServiceId,
      municipalServiceName,
      deductions,
      effectiveDate: entrada.dueDate,
      taxes,
    },
  };
}
